/**
 * Rewind extension.
 *
 * Creates a Git-backed checkpoint at the start of every agent run and restores
 * the matching checkpoint when the user forks from an earlier prompt.
 *
 * The restore happens on a new Git branch, so the current branch keeps the
 * newer work while the forked session starts from the selected checkpoint.
 */

import type { ExtensionAPI, SessionEntry } from "@mariozechner/pi-coding-agent";

const CHECKPOINT_TYPE = "rewind:checkpoint";

interface CheckpointEntryData {
	userEntryId: string;
	checkpointCommit: string;
	checkpointRef: string;
	branchName?: string;
	prompt: string;
	createdAt: string;
}

interface PendingCheckpoint {
	checkpointCommit: string;
	checkpointRef: string;
	branchName?: string;
	createdAt: string;
}

interface PendingRestore {
	branchName: string;
	safetyBranchName: string;
}

function getTextContent(content: string | Array<{ type: string; text?: string }>): string {
	if (typeof content === "string") {
		return content;
	}

	return content
		.filter((part): part is { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("");
}

function isCheckpointEntry(
	entry: SessionEntry,
): entry is SessionEntry & { type: "custom"; data?: CheckpointEntryData } {
	return entry.type === "custom" && entry.customType === CHECKPOINT_TYPE;
}

function makeBranchName(timestamp: string): string {
	const safe = timestamp.replace(/[:.]/g, "-").replace(/T/g, "-").replace(/Z/g, "").slice(0, 19);
	return `rewind-${safe}`;
}

async function getGitTopLevel(pi: ExtensionAPI, cwd: string): Promise<string | undefined> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (result.code !== 0) {
		return undefined;
	}
	return result.stdout.trim() || undefined;
}

async function createCheckpoint(pi: ExtensionAPI, cwd: string): Promise<PendingCheckpoint | undefined> {
	const topLevel = await getGitTopLevel(pi, cwd);
	if (!topLevel) {
		return undefined;
	}
	const createdAt = new Date().toISOString();
	const checkpointRef = `refs/pi-rewind/${createdAt.replace(/[:.]/g, "-").replace(/T/g, "-").replace(/Z/g, "")}`;

	const script = [
		"set -eu",
		'tmp_index="$(mktemp)"',
		'cleanup() { rm -f "$tmp_index"; }',
		"trap cleanup EXIT",
		'git rev-parse --verify HEAD >/dev/null 2>&1 && parent_flag="-p $(git rev-parse HEAD)" || parent_flag=""',
		'index_path="$(git rev-parse --git-path index)"',
		'if [ -f "$index_path" ]; then cp "$index_path" "$tmp_index"; fi',
		'GIT_INDEX_FILE="$tmp_index" git add -A -- .',
		'tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree)"',
		'if [ -n "$parent_flag" ]; then commit="$(printf "%s\n" "pi rewind checkpoint" | git commit-tree "$tree" $parent_flag)"; else commit="$(printf "%s\n" "pi rewind checkpoint" | git commit-tree "$tree")"; fi',
		'printf "%s\n" "$commit"',
	].join("; ");

	const result = await pi.exec("sh", ["-lc", script], { cwd: topLevel });
	if (result.code !== 0) {
		return undefined;
	}

	const checkpointCommit = result.stdout.trim();
	if (!checkpointCommit) {
		return undefined;
	}

	const refResult = await pi.exec("git", ["update-ref", checkpointRef, checkpointCommit], { cwd: topLevel });
	if (refResult.code !== 0) {
		return undefined;
	}

	const branchResult = await pi.exec("git", ["branch", "--show-current"], { cwd: topLevel });
	const branchName = branchResult.code === 0 ? branchResult.stdout.trim() || undefined : undefined;
	return {
		checkpointCommit,
		checkpointRef,
		branchName,
		createdAt,
	};
}

function findCheckpointForUser(entries: SessionEntry[], userEntryId: string): CheckpointEntryData | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (!isCheckpointEntry(entry)) {
			continue;
		}

		if (entry.data?.userEntryId === userEntryId) {
			return entry.data;
		}
	}

	return undefined;
}

async function branchExists(pi: ExtensionAPI, cwd: string, branchName: string): Promise<boolean> {
	const result = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], { cwd });
	return result.code === 0;
}

async function getUniqueBranchName(pi: ExtensionAPI, cwd: string, baseName: string): Promise<string> {
	let branchName = baseName;
	let counter = 2;

	while (await branchExists(pi, cwd, branchName)) {
		branchName = `${baseName}-${counter}`;
		counter++;
	}

	return branchName;
}

async function createSafetyBranch(pi: ExtensionAPI, cwd: string): Promise<string | undefined> {
	const checkpoint = await createCheckpoint(pi, cwd);
	if (!checkpoint) {
		return undefined;
	}

	const branchName = await getUniqueBranchName(
		pi,
		cwd,
		makeBranchName(checkpoint.createdAt).replace("rewind-", "rewind-saved-"),
	);
	const branchResult = await pi.exec("git", ["branch", branchName, checkpoint.checkpointCommit], { cwd });
	if (branchResult.code !== 0) {
		return undefined;
	}

	return branchName;
}

async function isValidBranchName(pi: ExtensionAPI, cwd: string, branchName: string): Promise<boolean> {
	if (!branchName || branchName.startsWith("-")) {
		return false;
	}

	const result = await pi.exec("git", ["check-ref-format", "--branch", branchName], { cwd });
	return result.code === 0;
}

export default function rewindExtension(pi: ExtensionAPI) {
	let pendingCheckpoint: PendingCheckpoint | undefined;
	let pendingRestore: PendingRestore | undefined;

	pi.on("agent_start", async (_event, ctx) => {
		pendingCheckpoint = await createCheckpoint(pi, ctx.cwd);
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (!pendingCheckpoint) {
			return;
		}

		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry.type !== "message" || entry.message.role !== "user") {
				continue;
			}

			const prompt = getTextContent(entry.message.content).trim();
			pi.appendEntry<CheckpointEntryData>(CHECKPOINT_TYPE, {
				userEntryId: entry.id,
				checkpointCommit: pendingCheckpoint.checkpointCommit,
				checkpointRef: pendingCheckpoint.checkpointRef,
				branchName: pendingCheckpoint.branchName,
				prompt,
				createdAt: pendingCheckpoint.createdAt,
			});
			break;
		}

		pendingCheckpoint = undefined;
	});

	pi.on("session_before_fork", async (event, ctx) => {
		pendingRestore = undefined;

		const checkpoint = findCheckpointForUser(ctx.sessionManager.getEntries(), event.entryId);
		if (!checkpoint) {
			if (ctx.hasUI) {
				ctx.ui.notify("No rewind checkpoint found for that prompt", "warning");
			}
			return { cancel: true };
		}

		if (!ctx.hasUI) {
			return { cancel: true };
		}

		const topLevel = await getGitTopLevel(pi, ctx.cwd);
		if (!topLevel) {
			if (ctx.hasUI) {
				ctx.ui.notify("Rewind restore requires a Git repository", "warning");
			}
			return { cancel: true };
		}

		const defaultBranchName = await getUniqueBranchName(pi, topLevel, makeBranchName(checkpoint.createdAt));
		let branchName = defaultBranchName;

		if (ctx.hasUI) {
			const promptPreview = checkpoint.prompt || event.entryId;
			const confirmed = await ctx.ui.confirm(
				"Restore checkpoint?",
				`This will save the current worktree on a safety branch and then switch Git to a new branch at the checkpoint captured before:\n\n${promptPreview}\n\nRestore branch: ${defaultBranchName}`,
			);
			if (!confirmed) {
				ctx.ui.notify("Checkpoint restore cancelled", "info");
				return { cancel: true };
			}

			const customBranchName = await ctx.ui.input("Restore branch name", defaultBranchName);
			if (customBranchName === undefined) {
				ctx.ui.notify("Checkpoint restore cancelled", "info");
				return { cancel: true };
			}

			const trimmed = customBranchName.trim();
			if (trimmed.length > 0) {
				branchName = trimmed;
			}
		}

		if (!(await isValidBranchName(pi, topLevel, branchName))) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Invalid branch name: ${branchName}`, "error");
			}
			return { cancel: true };
		}

		branchName = await getUniqueBranchName(pi, topLevel, branchName);
		const safetyBranchName = await createSafetyBranch(pi, topLevel);
		if (!safetyBranchName) {
			if (ctx.hasUI) {
				ctx.ui.notify("Failed to create safety branch for the current worktree", "error");
			}
			return { cancel: true };
		}

		const switchResult = await pi.exec("git", ["switch", "--force", "-c", branchName, checkpoint.checkpointRef], {
			cwd: topLevel,
		});
		if (switchResult.code !== 0) {
			await pi.exec("git", ["branch", "-D", safetyBranchName], { cwd: topLevel });
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Failed to restore checkpoint: ${switchResult.stderr.trim() || switchResult.stdout.trim()}`,
					"error",
				);
			}
			return { cancel: true };
		}

		pendingRestore = { branchName, safetyBranchName };
		return;
	});

	pi.on("session_fork", async (_event, ctx) => {
		const restore = pendingRestore;
		pendingRestore = undefined;

		if (!restore) {
			return;
		}
		if (ctx.hasUI) {
			ctx.ui.notify(
				`Restored checkpoint on branch ${restore.branchName}; previous state saved on ${restore.safetyBranchName}`,
				"info",
			);
		}
	});
}

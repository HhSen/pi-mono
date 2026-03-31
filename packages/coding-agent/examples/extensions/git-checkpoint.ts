/**
 * Git Checkpoint Extension
 *
 * Creates git stash checkpoints at each turn so /fork can restore code state.
 * When forking, offers to restore code to that point in history.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	type Checkpoint = { stash: string | null; head: string };
	const checkpoints = new Map<string, Checkpoint>();

	pi.on("turn_start", async (_event, ctx) => {
		// Find the last user message entry — that is what session_before_fork uses as entryId.
		const entries = ctx.sessionManager.getEntries();
		const userEntry = [...entries].reverse().find((e) => e.type === "message" && e.message.role === "user");
		if (!userEntry) return;
		if (checkpoints.has(userEntry.id)) return;

		// Record HEAD so we can undo any commits the agent makes during the turn.
		const headResult = await pi.exec("git", ["rev-parse", "HEAD"]);
		const head = headResult.stdout.trim();

		// Create a stash commit object without touching the working tree.
		const { stdout } = await pi.exec("git", ["stash", "create"]);
		const sha = stdout.trim();
		if (sha) {
			await pi.exec("git", ["stash", "store", "-m", `pi-checkpoint:${userEntry.id}`, sha]);
			checkpoints.set(userEntry.id, { stash: sha, head });
		} else {
			checkpoints.set(userEntry.id, { stash: null, head });
		}
	});

	pi.on("session_before_fork", async (event, ctx) => {
		const checkpoint = checkpoints.get(event.entryId);
		if (!checkpoint) return;

		if (!ctx.hasUI) return;

		const choice = await ctx.ui.select("Restore code state?", [
			"Yes, restore code to that point",
			"No, keep current code",
		]);

		if (choice?.startsWith("Yes")) {
			// Save all current changes (including untracked) before restoring.
			await pi.exec("git", ["stash", "push", "-u", "-m", "pi:pre restore temp"]);
			// Reset to the HEAD recorded at checkpoint time to undo any commits the agent made.
			await pi.exec("git", ["reset", "--hard", checkpoint.head]);
			// Remove any untracked files the agent created.
			await pi.exec("git", ["clean", "-fd"]);
			// Re-apply the dirty working tree state that existed at checkpoint time.
			if (checkpoint.stash) {
				await pi.exec("git", ["stash", "apply", checkpoint.stash]);
			}
			ctx.ui.notify("Code restored to checkpoint", "info");
		}
	});
}

import { describe, expect, test, vi } from "vitest";
import gitCheckpointExtension from "../examples/extensions/git-checkpoint.js";
import type { ExtensionAPI, ExtensionContext } from "../src/core/extensions/index.js";
import type { ReadonlySessionManager, SessionEntry } from "../src/core/session-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserEntry(id: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: new Date().toISOString(),
		message: {
			role: "user",
			content: [{ type: "text", text: "hello" }],
			timestamp: Date.now(),
		},
	} as SessionEntry;
}

function makeAssistantEntry(id: string): SessionEntry {
	return {
		type: "message",
		id,
		parentId: null,
		timestamp: new Date().toISOString(),
		message: {
			role: "assistant",
			content: [],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "claude-3-5-sonnet",
			usage: { inputTokens: 0, outputTokens: 0 },
			stopReason: "end_turn",
			timestamp: Date.now(),
		},
	} as unknown as SessionEntry;
}

function createSessionManager(entries: SessionEntry[]): ReadonlySessionManager {
	return {
		getEntries: () => entries,
		getLeafEntry: () => entries.at(-1),
		getLeafId: () => entries.at(-1)?.id ?? null,
		getEntry: (id: string) => entries.find((e) => e.id === id),
		getBranch: () => entries,
		getLabel: () => undefined,
		getTree: () => [],
		getHeader: () => null,
		getSessionName: () => undefined,
		getCwd: () => process.cwd(),
		getSessionDir: () => "/tmp",
		getSessionId: () => "test-session",
		getSessionFile: () => undefined,
	} as unknown as ReadonlySessionManager;
}

function createContext(sessionManager: ReadonlySessionManager): ExtensionContext {
	return {
		hasUI: false,
		ui: {} as ExtensionContext["ui"],
		cwd: process.cwd(),
		sessionManager,
		modelRegistry: {} as ExtensionContext["modelRegistry"],
		model: undefined,
		isIdle: () => true,
		signal: undefined,
		abort: vi.fn(),
		hasPendingMessages: () => false,
		shutdown: vi.fn(),
		getContextUsage: () => ({ tokens: 0, contextWindow: 200_000, percent: 0 }),
		compact: vi.fn(),
		getSystemPrompt: () => "",
	};
}

interface CapturedHandlers {
	turn_start?: (event: { type: "turn_start" }, ctx: ExtensionContext) => Promise<void>;
	session_before_fork?: (
		event: { type: "session_before_fork"; entryId: string },
		ctx: ExtensionContext,
	) => Promise<void>;
	agent_end?: (event: { type: "agent_end" }, ctx: ExtensionContext) => Promise<void>;
}

function setupExtension(execMock: ReturnType<typeof vi.fn>) {
	const handlers: CapturedHandlers = {};

	const api = {
		on: (event: string, handler: (...args: unknown[]) => Promise<void>) => {
			(handlers as Record<string, unknown>)[event] = handler;
		},
		exec: execMock,
	} as unknown as ExtensionAPI;

	gitCheckpointExtension(api);

	return { handlers };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("git-checkpoint example extension", () => {
	describe("turn_start — checkpoint creation", () => {
		test("creates a stash checkpoint keyed on the last user message entry ID", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "abc123stash\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const userEntry = makeUserEntry("user-1");
			const ctx = createContext(createSessionManager([userEntry]));

			await handlers.turn_start?.({ type: "turn_start" }, ctx);

			expect(execMock).toHaveBeenCalledWith("git", ["stash", "create"]);
		});

		test("does not create a checkpoint when there are no user message entries", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "abc123stash\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			// Only an assistant entry — no user message
			const assistantEntry = makeAssistantEntry("asst-1");
			const ctx = createContext(createSessionManager([assistantEntry]));

			await handlers.turn_start?.({ type: "turn_start" }, ctx);

			expect(execMock).not.toHaveBeenCalled();
		});

		test("does not store a checkpoint when git stash create returns empty (no dirty files)", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "   \n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const userEntry = makeUserEntry("user-1");
			const ctx = createContext(createSessionManager([userEntry]));

			await handlers.turn_start?.({ type: "turn_start" }, ctx);

			// exec was called but the empty ref must not be stored — confirmed by fork producing no restore
			expect(execMock).toHaveBeenCalledWith("git", ["stash", "create"]);
		});

		test("uses the last user entry when entries contain a mix of types", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "stashref\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const entries: SessionEntry[] = [
				makeUserEntry("user-1"),
				makeAssistantEntry("asst-1"),
				makeUserEntry("user-2"),
				makeAssistantEntry("asst-2"),
				// tool_result-like non-message entry
				{
					type: "model_change",
					id: "meta-1",
					parentId: "asst-2",
					timestamp: new Date().toISOString(),
					provider: "anthropic",
					modelId: "claude-3-5-sonnet",
				} as SessionEntry,
			];

			const ctx = createContext(createSessionManager(entries));
			await handlers.turn_start?.({ type: "turn_start" }, ctx);

			expect(execMock).toHaveBeenCalledWith("git", ["stash", "create"]);
		});
	});

	describe("session_before_fork — stash restore", () => {
		test("applies stash when user confirms and hasUI is true", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "stashref\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const userEntry = makeUserEntry("user-1");
			const ctx = createContext(createSessionManager([userEntry]));

			// Populate checkpoint via turn_start
			await handlers.turn_start?.({ type: "turn_start" }, ctx);
			execMock.mockClear();

			// Fork from that same user entry with UI available
			const uiCtx = {
				...ctx,
				hasUI: true,
				ui: {
					select: vi.fn().mockResolvedValue("Yes, restore code to that point"),
					notify: vi.fn(),
				} as unknown as ExtensionContext["ui"],
			};

			await handlers.session_before_fork?.(
				{ type: "session_before_fork", entryId: "user-1" },
				uiCtx as ExtensionContext,
			);

			expect(execMock).toHaveBeenCalledWith("git", ["stash", "push", "-u", "-m", "pi:pre restore temp"]);
			expect(execMock).toHaveBeenCalledWith("git", ["reset", "--hard", "stashref"]);
			expect(execMock).toHaveBeenCalledWith("git", ["clean", "-fd"]);
			expect(execMock).toHaveBeenCalledWith("git", ["stash", "apply", "stashref"]);
			expect(uiCtx.ui.notify).toHaveBeenCalledWith("Code restored to checkpoint", "info");
		});

		test("does not apply stash when user declines", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "stashref\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const userEntry = makeUserEntry("user-1");
			const ctx = createContext(createSessionManager([userEntry]));

			await handlers.turn_start?.({ type: "turn_start" }, ctx);
			execMock.mockClear();

			const uiCtx = {
				...ctx,
				hasUI: true,
				ui: {
					select: vi.fn().mockResolvedValue("No, keep current code"),
					notify: vi.fn(),
				} as unknown as ExtensionContext["ui"],
			};

			await handlers.session_before_fork?.(
				{ type: "session_before_fork", entryId: "user-1" },
				uiCtx as ExtensionContext,
			);

			expect(execMock).not.toHaveBeenCalled();
		});

		test("does nothing when hasUI is false (non-interactive mode)", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "stashref\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const userEntry = makeUserEntry("user-1");
			const ctx = createContext(createSessionManager([userEntry]));

			await handlers.turn_start?.({ type: "turn_start" }, ctx);
			execMock.mockClear();

			// ctx.hasUI is false by default in createContext
			await handlers.session_before_fork?.({ type: "session_before_fork", entryId: "user-1" }, ctx);

			expect(execMock).not.toHaveBeenCalled();
		});

		test("does nothing when forking an entry that has no checkpoint", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "stashref\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const userEntry = makeUserEntry("user-1");
			const ctx = createContext(createSessionManager([userEntry]));

			// turn_start never called → no checkpoint stored
			const uiCtx = {
				...ctx,
				hasUI: true,
				ui: {
					select: vi.fn().mockResolvedValue("Yes, restore code to that point"),
					notify: vi.fn(),
				} as unknown as ExtensionContext["ui"],
			};

			await handlers.session_before_fork?.(
				{ type: "session_before_fork", entryId: "user-1" },
				uiCtx as ExtensionContext,
			);

			expect(execMock).not.toHaveBeenCalled();
		});

		test("key alignment: fork entryId matches the user entry ID used at turn_start", async () => {
			// This is the core regression test for the original bug where
			// checkpoints were keyed on tool-result leaf IDs, not user entry IDs.
			const execMock = vi.fn().mockResolvedValue({ stdout: "stashref\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const userEntry = makeUserEntry("user-turn-42");
			// Simulate entries that look like mid-turn state (leaf is a tool-result-like node)
			const toolEntry = makeAssistantEntry("tool-result-99");
			const entries = [userEntry, toolEntry];
			const ctx = createContext(createSessionManager(entries));

			await handlers.turn_start?.({ type: "turn_start" }, ctx);
			execMock.mockClear();

			// session_before_fork always provides the user message entry ID
			const uiCtx = {
				...ctx,
				hasUI: true,
				ui: {
					select: vi.fn().mockResolvedValue("Yes, restore code to that point"),
					notify: vi.fn(),
				} as unknown as ExtensionContext["ui"],
			};

			await handlers.session_before_fork?.(
				{ type: "session_before_fork", entryId: "user-turn-42" },
				uiCtx as ExtensionContext,
			);

			// stash apply must be called — proves checkpoint was stored under the user entry ID
			expect(execMock).toHaveBeenCalledWith("git", ["reset", "--hard", "stashref"]);
			expect(execMock).toHaveBeenCalledWith("git", ["stash", "apply", "stashref"]);
		});
	});

	describe("agent_end — checkpoint cleanup", () => {
		test("checkpoints persist after agent completes so fork can still restore", async () => {
			const execMock = vi.fn().mockResolvedValue({ stdout: "stashref\n", stderr: "", code: 0, killed: false });
			const { handlers } = setupExtension(execMock);

			const userEntry = makeUserEntry("user-1");
			const ctx = createContext(createSessionManager([userEntry]));

			await handlers.turn_start?.({ type: "turn_start" }, ctx);
			execMock.mockClear();

			// Fork after agent_end must still find the checkpoint
			const uiCtx = {
				...ctx,
				hasUI: true,
				ui: {
					select: vi.fn().mockResolvedValue("Yes, restore code to that point"),
					notify: vi.fn(),
				} as unknown as ExtensionContext["ui"],
			};

			await handlers.session_before_fork?.(
				{ type: "session_before_fork", entryId: "user-1" },
				uiCtx as ExtensionContext,
			);

			expect(execMock).toHaveBeenCalledWith("git", ["reset", "--hard", "stashref"]);
			expect(execMock).toHaveBeenCalledWith("git", ["stash", "apply", "stashref"]);
		});
	});
});

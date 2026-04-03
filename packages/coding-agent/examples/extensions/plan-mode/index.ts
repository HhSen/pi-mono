/**
 * Plan Mode Extension
 *
 * Read-only exploration mode for safe code analysis.
 * When enabled, only read-only tools are available.
 *
 * Features:
 * - /plan command or Ctrl+Alt+P to toggle
 * - Bash restricted to allowlisted read-only commands
 * - plan_add_todo tool: LLM explicitly adds steps during planning
 * - plan_complete_todo tool: LLM explicitly marks steps done during execution
 * - Progress tracking widget during execution
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
	DEFAULT_NORMAL_MODE_TOOLS,
	getExecutionModeTools,
	getNormalModeTools,
	isSafeCommand,
	type TodoItem,
} from "./utils.js";

// Tools
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire", "plan_add_todo", "plan_remove_todo"];

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let nextStep = 1;
	let normalModeTools = [...DEFAULT_NORMAL_MODE_TOOLS];

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		// Footer status
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		// Widget showing todo list
		if (executionMode && todoItems.length > 0) {
			const lines = todoItems.map((item) => {
				if (item.completed) {
					return (
						ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					);
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
		} else {
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function captureNormalModeTools(): void {
		normalModeTools = getNormalModeTools(pi.getActiveTools());
	}

	function getExecutionTools(): string[] {
		return getExecutionModeTools(normalModeTools);
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		if (!planModeEnabled) {
			captureNormalModeTools();
		}

		planModeEnabled = !planModeEnabled;
		executionMode = false;
		todoItems = [];
		nextStep = 1;

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
		} else {
			pi.setActiveTools(normalModeTools);
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		updateStatus(ctx);
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			todos: todoItems,
			executing: executionMode,
			nextStep,
		});
	}

	// =========================================================================
	// plan_add_todo — available in plan mode so the LLM explicitly adds steps
	// =========================================================================

	pi.registerTool({
		name: "plan_add_todo",
		label: "Plan: add steps",
		description: "Add one or more steps to the plan.",
		promptSnippet: "plan_add_todo(items) — add steps to the current plan",
		parameters: Type.Object({
			items: Type.Array(Type.String(), { description: "One or more step descriptions to add (one line each)." }),
		}),

		execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const added: TodoItem[] = [];
			for (const text of params.items) {
				const item: TodoItem = { step: nextStep++, text: text.trim(), completed: false };
				todoItems.push(item);
				added.push(item);
			}
			const summary = added.map((i) => `${i.step}. ${i.text}`).join("\n");
			return Promise.resolve({
				content: [{ type: "text" as const, text: `Added ${added.length} step(s):\n${summary}` }],
				details: { added },
			});
		},
	});

	// =========================================================================
	// plan_remove_todo — remove an unnecessary step (both modes)
	// =========================================================================

	pi.registerTool({
		name: "plan_remove_todo",
		label: "Plan: remove step",
		description: "Remove a step from the plan that is no longer needed.",
		promptSnippet: "plan_remove_todo(step) — remove a step from the plan",
		parameters: Type.Object({
			step: Type.Number({ description: "The step number to remove." }),
		}),

		execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const idx = todoItems.findIndex((t) => t.step === params.step);
			if (idx === -1) {
				return Promise.resolve({
					content: [{ type: "text" as const, text: `Step ${params.step} not found.` }],
					details: { step: params.step, error: "not found" },
					isError: true,
				});
			}
			const [removed] = todoItems.splice(idx, 1);
			persistState();
			return Promise.resolve({
				content: [{ type: "text" as const, text: `Removed step ${removed.step}: ${removed.text}` }],
				details: { step: removed.step, text: removed.text },
			});
		},
	});

	// =========================================================================
	// plan_complete_todo — available in execution mode so the LLM marks steps done
	// =========================================================================

	pi.registerTool({
		name: "plan_complete_todo",
		label: "Plan: complete step",
		description: "Mark a plan step as completed. Call this immediately after finishing each step.",
		promptSnippet: "plan_complete_todo(step) — mark a plan step as done",
		parameters: Type.Object({
			step: Type.Number({ description: "The step number to mark as completed." }),
		}),

		execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const item = todoItems.find((t) => t.step === params.step);
			if (!item) {
				return Promise.resolve({
					content: [{ type: "text" as const, text: `Step ${params.step} not found.` }],
					details: { step: params.step, error: "not found" },
					isError: true,
				});
			}
			item.completed = true;
			updateStatus(_ctx);
			persistState();
			return Promise.resolve({
				content: [{ type: "text" as const, text: `Step ${params.step} completed: ${item.text}` }],
				details: { step: item.step, text: item.text },
			});
		},
	});

	// =========================================================================
	// Commands and shortcuts
	// =========================================================================

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("todos", {
		description: "Show current plan todo list",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No todos. Create a plan first with /plan", "info");
				return;
			}
			const list = todoItems.map((item) => `${item.step}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// =========================================================================
	// Tool guards
	// =========================================================================

	// Block destructive bash commands in plan mode
	pi.on("tool_call", async (event) => {
		if (!planModeEnabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
			};
		}
	});

	// =========================================================================
	// Context filtering
	// =========================================================================

	// Filter out stale plan mode context when not in plan mode
	pi.on("context", async (event) => {
		if (planModeEnabled) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as typeof m & { customType?: string };
				if (msg.customType === "plan-mode-context") return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && "text" in c && (c.text as string)?.includes("[PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	// =========================================================================
	// Agent lifecycle
	// =========================================================================

	// Inject plan/execution context before agent starts
	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- You CANNOT use: edit, write (file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands

Ask clarifying questions using the questionnaire tool.
Use brave-search skill via bash for web research.

Build your plan with todos.
Do NOT attempt to make changes - only describe and register what you would do.`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, complete todo before moving to the next.`,
					display: false,
				},
			};
		}
	});

	// Handle plan completion and plan mode UI
	pi.on("agent_end", async (_event, ctx) => {
		// Check if execution is complete
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t) => t.completed)) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				executionMode = false;
				todoItems = [];
				nextStep = 1;
				pi.setActiveTools(normalModeTools);
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;

		// Show plan steps gathered via plan_add_todo and prompt for next action
		if (todoItems.length > 0) {
			const todoListText = todoItems.map((t) => `${t.step}. ☐ ${t.text}`).join("\n");
			pi.sendMessage(
				{
					customType: "plan-todo-list",
					content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
					display: true,
				},
				{ triggerTurn: false },
			);
		}

		const choice = await ctx.ui.select("Plan mode - what next?", [
			todoItems.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice?.startsWith("Execute")) {
			planModeEnabled = false;
			executionMode = todoItems.length > 0;
			pi.setActiveTools(executionMode ? getExecutionTools() : normalModeTools);
			updateStatus(ctx);

			const execMessage =
				todoItems.length > 0
					? `Execute the plan. Start with step ${todoItems[0].step}: ${todoItems[0].text}`
					: "Execute the plan you just created.";
			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true },
			);
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
		}
	});

	// Restore state on session start/resume
	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();

		// Restore persisted state
		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as
			| { data?: { enabled: boolean; todos?: TodoItem[]; executing?: boolean; nextStep?: number } }
			| undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
			nextStep = planModeEntry.data.nextStep ?? todoItems.length + 1;
		}

		captureNormalModeTools();

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
		} else if (executionMode) {
			pi.setActiveTools(getExecutionTools());
		} else {
			pi.setActiveTools(normalModeTools);
		}
		updateStatus(ctx);
	});
}

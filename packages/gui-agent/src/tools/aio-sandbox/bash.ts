import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { z } from "zod";

import {
	createSandboxResponseSchema,
	createToolTextResult,
	executeSandboxRequest,
	getSandboxApiUrl,
	type SandboxToolOptions,
} from "./utils.js";

const DEFAULT_TIMEOUT_SECONDS = 60;

const BashParameters = Type.Object({
	command: Type.String({ description: "The bash command to execute." }),
	timeout: Type.Optional(Type.Number({ description: "Timeout in seconds." })),
	truncate: Type.Optional(Type.Number({ description: "Maximum output length before truncation." })),
});

export const ConsoleEntrySchema = z.object({
	ps1: z.string(),
	command: z.string(),
	output: z.string(),
});

const BashCommandResultSchema = z.object({
	session_id: z.string(),
	command: z.string(),
	status: z.enum(["running", "completed", "failed"]),
	output: z.string(),
	console: z.array(ConsoleEntrySchema),
	exit_code: z.number(),
});

export const BashResponseSuccessSchema = createSandboxResponseSchema(BashCommandResultSchema).extend({
	hint: z.string().optional(),
});

export interface SandboxBashToolOptions extends SandboxToolOptions {
	defaultTimeoutSeconds?: number;
}

export function createBashTool(options: SandboxBashToolOptions = {}): ToolDefinition<typeof BashParameters> {
	const apiUrl = getSandboxApiUrl(options);
	const defaultTimeoutSeconds = options.defaultTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

	return {
		name: "bash",
		label: "Bash",
		description: "Execute a bash command. Returns stdout and stderr.",
		parameters: BashParameters,
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
			const result = await executeSandboxRequest({
				apiUrl,
				path: "/v1/shell/exec",
				body: {
					command: params.command,
					timeout: params.timeout ?? defaultTimeoutSeconds,
					truncate: params.truncate,
				},
				schema: BashResponseSuccessSchema,
				failureLabel: "Failed to execute command",
			});

			if (!result.ok) {
				return result.result;
			}

			const data = result.data.data;
			if (!data) {
				return createToolTextResult(
					result.data.message ?? "Command completed with no output returned.",
					result.data,
				);
			}

			return createToolTextResult(data.output, result.data);
		},
	};
}

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { z } from "zod";

import {
	createSandboxFileTool,
	createSandboxResponseSchema,
	createToolTextResult,
	type SandboxToolOptions,
} from "./utils.js";

const ReadParameters = Type.Object({
	filePath: Type.String({ description: "Absolute file path to read." }),
	startLine: Type.Optional(Type.Number({ description: "Start line (0-based)." })),
	endLine: Type.Optional(Type.Number({ description: "End line, not inclusive." })),
	sudo: Type.Optional(Type.Boolean({ description: "Whether to use sudo privileges." })),
});

const FileReadResultSchema = z.object({
	content: z.string(),
	file: z.string(),
});

const FileReadResponseSchema = createSandboxResponseSchema(FileReadResultSchema);

export type SandboxReadToolOptions = SandboxToolOptions;

export function createReadTool(options: SandboxReadToolOptions = {}): ToolDefinition<typeof ReadParameters> {
	return createSandboxFileTool({
		name: "read",
		label: "Read",
		description: "Read file content from the sandbox.",
		parameters: ReadParameters,
		endpointPath: "/v1/file/read",
		responseSchema: FileReadResponseSchema,
		failureLabel: "Failed to read file",
		options,
		mapBody: (params) => ({
			file: params.filePath,
			start_line: params.startLine,
			end_line: params.endLine,
			sudo: params.sudo,
		}),
		renderSuccess: (response) => {
			const data = response.data;
			if (!data) {
				return createToolTextResult(response.message ?? "Read completed with no content returned.", response);
			}

			return createToolTextResult(data.content, response);
		},
	});
}

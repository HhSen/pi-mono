import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { z } from "zod";

import {
	createSandboxFileTool,
	createSandboxResponseSchema,
	createToolTextResult,
	type SandboxToolOptions,
} from "./utils.js";

const ReplaceParameters = Type.Object({
	filePath: Type.String({ description: "Absolute file path to update." }),
	oldString: Type.String({ description: "Original string to replace." }),
	newString: Type.String({ description: "Replacement string." }),
	sudo: Type.Optional(Type.Boolean({ description: "Whether to use sudo privileges." })),
});

const FileReplaceResultSchema = z.object({
	file: z.string(),
	replaced_count: z.number().optional(),
});

const FileReplaceResponseSchema = createSandboxResponseSchema(FileReplaceResultSchema);

export type SandboxReplaceToolOptions = SandboxToolOptions;

export function createReplaceTool(options: SandboxReplaceToolOptions = {}): ToolDefinition<typeof ReplaceParameters> {
	return createSandboxFileTool({
		name: "replace",
		label: "Replace",
		description: "Replace text in a sandbox file.",
		parameters: ReplaceParameters,
		endpointPath: "/v1/file/replace",
		responseSchema: FileReplaceResponseSchema,
		failureLabel: "Failed to replace file content",
		options,
		mapBody: (params) => ({
			file: params.filePath,
			old_str: params.oldString,
			new_str: params.newString,
			sudo: params.sudo,
		}),
		renderSuccess: (response) => {
			const data = response.data;
			if (!data) {
				return createToolTextResult(
					response.message ?? "Replace completed with no file metadata returned.",
					response,
				);
			}

			const replacedCount = data.replaced_count ?? 0;
			return createToolTextResult(
				`Replaced ${replacedCount} occurrence${replacedCount === 1 ? "" : "s"} in ${data.file}`,
				response,
			);
		},
	});
}

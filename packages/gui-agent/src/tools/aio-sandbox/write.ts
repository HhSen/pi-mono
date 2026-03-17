import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { z } from "zod";

import {
	createSandboxFileTool,
	createSandboxResponseSchema,
	createToolTextResult,
	type SandboxToolOptions,
} from "./utils.js";

const WriteParameters = Type.Object({
	filePath: Type.String({ description: "Absolute file path to write." }),
	content: Type.String({ description: "Content to write to the file." }),
	encoding: Type.Optional(
		Type.Union([Type.Literal("utf-8"), Type.Literal("base64")], { description: "Content encoding." }),
	),
	append: Type.Optional(Type.Boolean({ description: "Whether to append instead of overwrite." })),
	leadingNewline: Type.Optional(Type.Boolean({ description: "Whether to prepend a newline in text mode." })),
	trailingNewline: Type.Optional(Type.Boolean({ description: "Whether to append a newline in text mode." })),
	sudo: Type.Optional(Type.Boolean({ description: "Whether to use sudo privileges." })),
});

const FileWriteResultSchema = z.object({
	file: z.string(),
	bytes_written: z.number().nullable().optional(),
});

const FileWriteResponseSchema = createSandboxResponseSchema(FileWriteResultSchema);

export type SandboxWriteToolOptions = SandboxToolOptions;

export function createWriteTool(options: SandboxWriteToolOptions = {}): ToolDefinition<typeof WriteParameters> {
	return createSandboxFileTool({
		name: "write",
		label: "Write",
		description: "Write file content to the sandbox.",
		parameters: WriteParameters,
		endpointPath: "/v1/file/write",
		responseSchema: FileWriteResponseSchema,
		failureLabel: "Failed to write file",
		options,
		mapBody: (params) => ({
			file: params.filePath,
			content: params.content,
			encoding: params.encoding,
			append: params.append,
			leading_newline: params.leadingNewline,
			trailing_newline: params.trailingNewline,
			sudo: params.sudo,
		}),
		renderSuccess: (response) => {
			const data = response.data;
			if (!data) {
				return createToolTextResult(
					response.message ?? "Write completed with no file metadata returned.",
					response,
				);
			}

			const bytesWritten = data.bytes_written == null ? "unknown bytes" : `${data.bytes_written} bytes`;
			return createToolTextResult(`Wrote ${bytesWritten} to ${data.file}`, response);
		},
	});
}

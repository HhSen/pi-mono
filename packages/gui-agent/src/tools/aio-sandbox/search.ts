import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { z } from "zod";

import {
	createSandboxFileTool,
	createSandboxResponseSchema,
	createToolTextResult,
	type SandboxToolOptions,
} from "./utils.js";

const SearchParameters = Type.Object({
	filePath: Type.String({ description: "Absolute file path to search." }),
	regex: Type.String({ description: "Regular expression pattern." }),
	sudo: Type.Optional(Type.Boolean({ description: "Whether to use sudo privileges." })),
});

const FileSearchResultSchema = z.object({
	file: z.string(),
	matches: z.array(z.string()).optional(),
	line_numbers: z.array(z.number()).optional(),
});

const FileSearchResponseSchema = createSandboxResponseSchema(FileSearchResultSchema);

export type SandboxSearchToolOptions = SandboxToolOptions;

export function createSearchTool(options: SandboxSearchToolOptions = {}): ToolDefinition<typeof SearchParameters> {
	return createSandboxFileTool({
		name: "search",
		label: "Search",
		description: "Search for regex matches in a sandbox file.",
		parameters: SearchParameters,
		endpointPath: "/v1/file/search",
		responseSchema: FileSearchResponseSchema,
		failureLabel: "Failed to search file",
		options,
		mapBody: (params) => ({
			file: params.filePath,
			regex: params.regex,
			sudo: params.sudo,
		}),
		renderSuccess: (response) => {
			const data = response.data;
			if (!data) {
				return createToolTextResult(response.message ?? "Search completed with no results returned.", response);
			}

			const matches = data.matches ?? [];
			const lineNumbers = data.line_numbers ?? [];
			if (matches.length === 0) {
				return createToolTextResult(`No matches found in ${data.file}`, response);
			}

			const lines = matches.map((match, index) => {
				const lineNumber = lineNumbers[index];
				return lineNumber == null ? match : `${lineNumber}: ${match}`;
			});

			return createToolTextResult(lines.join("\n"), response);
		},
	});
}

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { Static, TSchema } from "@sinclair/typebox";
import { z } from "zod";

import { DEFAULT_SANDBOX_API_URL } from "../../constants.js";

export const SandboxValidationErrorSchema = z.object({
	detail: z.array(
		z.object({
			loc: z.array(z.string()),
			msg: z.string(),
			type: z.string(),
		}),
	),
});

export interface SandboxToolOptions {
	apiUrl?: string;
}

export function getSandboxApiUrl(options: SandboxToolOptions = {}): string {
	return (options.apiUrl ?? DEFAULT_SANDBOX_API_URL).replace(/\/+$/, "");
}

export function createToolTextResult(text: string, details: unknown) {
	return {
		content: [{ type: "text" as const, text }],
		details,
	};
}

export type ToolTextResult = ReturnType<typeof createToolTextResult>;

export function createSandboxResponseSchema<T extends z.ZodType>(dataSchema: T) {
	return z.object({
		success: z.boolean(),
		message: z.string().nullable().optional(),
		data: dataSchema.nullable().optional(),
	});
}

export async function parseSandboxResponse<T extends z.ZodType>(
	response: Response,
	schema: T,
	failureLabel: string,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; result: ToolTextResult }> {
	if (!response.ok) {
		if (response.status === 422) {
			const result = await response.json();
			const error = SandboxValidationErrorSchema.parse(result);
			return {
				ok: false,
				result: createToolTextResult(`Validation Error: ${error.detail[0]?.msg ?? "Invalid request"}`, result),
			};
		}

		const errorText = await response.text();
		return {
			ok: false,
			result: createToolTextResult(`${failureLabel}: HTTP ${response.status} - ${errorText}`, { errorText }),
		};
	}

	const result = await response.json();
	return {
		ok: true,
		data: schema.parse(result),
	};
}

interface ExecuteSandboxRequestOptions<T extends z.ZodType> {
	apiUrl: string;
	path: string;
	body: unknown;
	schema: T;
	failureLabel: string;
}

export async function executeSandboxRequest<T extends z.ZodType>(
	options: ExecuteSandboxRequestOptions<T>,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; result: ToolTextResult }> {
	try {
		const response = await fetch(`${options.apiUrl}${options.path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(options.body),
		});

		return await parseSandboxResponse(response, options.schema, options.failureLabel);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return {
			ok: false,
			result: createToolTextResult(`${options.failureLabel}: ${message}`, { error: message }),
		};
	}
}

interface CreateSandboxFileToolOptions<TParameters extends TSchema, TResponse extends z.ZodType> {
	name: string;
	label: string;
	description: string;
	parameters: TParameters;
	endpointPath: string;
	responseSchema: TResponse;
	failureLabel: string;
	options?: SandboxToolOptions;
	mapBody: (params: Static<TParameters>) => unknown;
	renderSuccess: (response: z.infer<TResponse>) => ToolTextResult;
}

export function createSandboxFileTool<TParameters extends TSchema, TResponse extends z.ZodType>(
	options: CreateSandboxFileToolOptions<TParameters, TResponse>,
): ToolDefinition<TParameters> {
	const apiUrl = getSandboxApiUrl(options.options);

	return {
		name: options.name,
		label: options.label,
		description: options.description,
		parameters: options.parameters,
		execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
			const result = await executeSandboxRequest({
				apiUrl,
				path: options.endpointPath,
				body: options.mapBody(params),
				schema: options.responseSchema,
				failureLabel: options.failureLabel,
			});

			if (!result.ok) {
				return result.result;
			}

			return options.renderSuccess(result.data);
		},
	};
}

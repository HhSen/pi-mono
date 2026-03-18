import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { ApiStreamEvent } from "./types.js";

function getMessageText(message: unknown): string | undefined {
	if (typeof message !== "object" || message === null || !("content" in message)) {
		return undefined;
	}

	const { content } = message as { content?: unknown };
	if (!Array.isArray(content)) {
		return undefined;
	}

	const textParts = content
		.filter(
			(part): part is { type: string; text?: string } => typeof part === "object" && part !== null && "type" in part,
		)
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text);

	return textParts.length > 0 ? textParts.join("\n") : undefined;
}

export function mapAgentSessionEvent(event: AgentSessionEvent): ApiStreamEvent | undefined {
	switch (event.type) {
		case "message_start": {
			const text = getMessageText(event.message);
			return {
				type: "message_start",
				role: event.message.role,
				...(text ? { text } : {}),
			};
		}
		case "message_update":
			switch (event.assistantMessageEvent.type) {
				case "text_delta":
					return {
						type: "text_delta",
						delta: event.assistantMessageEvent.delta,
						contentIndex: event.assistantMessageEvent.contentIndex,
					};
				case "thinking_delta":
					return {
						type: "thinking_delta",
						delta: event.assistantMessageEvent.delta,
						contentIndex: event.assistantMessageEvent.contentIndex,
					};
				default:
					return undefined;
			}
		case "message_end": {
			const text = getMessageText(event.message);
			return {
				type: "message_end",
				role: event.message.role,
				...(text ? { text } : {}),
			};
		}
		case "tool_execution_start":
			return {
				type: "tool_execution_start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
			};
		case "tool_execution_update":
			return {
				type: "tool_execution_update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				partialResult: event.partialResult,
			};
		case "tool_execution_end":
			return {
				type: "tool_execution_end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				isError: event.isError,
				result: event.result,
			};
		case "agent_end":
			return {
				type: "agent_end",
				messageCount: event.messages.length,
			};
		default:
			return undefined;
	}
}

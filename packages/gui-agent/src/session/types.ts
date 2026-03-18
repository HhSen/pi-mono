import type { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { GuiAgentConfig } from "../config.js";

export interface ModelSelector {
	provider: string;
	id: string;
}

export interface StreamRequest {
	message: string;
	cwd?: string;
	model?: ModelSelector;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	metadata?: Record<string, unknown>;
}

export type ApiStreamEvent =
	| {
			type: "session_start";
			sessionId: string;
			cwd: string;
			modelId?: string;
			provider?: string;
			thinkingLevel: StreamRequest["thinkingLevel"];
	  }
	| {
			type: "message_start" | "message_end";
			role: string;
			text?: string;
	  }
	| {
			type: "text_delta" | "thinking_delta";
			delta: string;
			contentIndex: number;
	  }
	| {
			type: "tool_execution_start";
			toolCallId: string;
			toolName: string;
			args: unknown;
	  }
	| {
			type: "tool_execution_update";
			toolCallId: string;
			toolName: string;
			partialResult: unknown;
	  }
	| {
			type: "tool_execution_end";
			toolCallId: string;
			toolName: string;
			isError: boolean;
			result: unknown;
	  }
	| {
			type: "agent_end";
			messageCount: number;
	  }
	| {
			type: "error";
			message: string;
	  };

export type StreamResponse = ApiStreamEvent;

export interface GuiAgentRuntime {
	config: GuiAgentConfig;
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
}

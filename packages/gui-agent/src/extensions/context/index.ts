import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("context", async (event) => {
		const messages: AgentMessage[] = event.messages.map((message) => {
			if (message.role !== "user") return message;
			if (typeof message.content !== "string") return message;
			return {
				...message,
				content: `[custom preprocessor]\n${message.content}`,
			};
		});
		return { messages };
	});
}

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// Register new provider with models
	pi.registerProvider("AWS-DiDi", {
		baseUrl: "http://litellm-alb-1113919293.us-east-1.elb.amazonaws.com",
		apiKey: "sk-hpFEsEGwHhDOs7KnjsUA6w",
		api: "openai-completions",
		models: [
			{
				id: "claude-sonnet-4-6",
				name: "claude-sonnet-4-6",
				reasoning: true,
				input: ["text", "image"],
				cost: { input: 3, output: 15, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 256000,
				maxTokens: 8192,
			},
		],
	});
}

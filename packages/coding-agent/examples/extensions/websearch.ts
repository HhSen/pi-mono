import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

const ContentsHighlights = Type.Object({
	maxCharacters: Type.Optional(Type.Integer({ minimum: 1, description: "Maximum characters for highlights." })),
});

const WebsearchParams = Type.Object({
	query: Type.String({ description: "Natural language search query. Supports long, semantically rich descriptions." }),
	numResults: Type.Optional(
		Type.Integer({ minimum: 1, maximum: 100, description: "Number of results to return. Default: 10." }),
	),
	contents: Type.Optional(
		Type.Object({
			highlights: Type.Optional(Type.Union([Type.Boolean(), ContentsHighlights])),
		}),
	),
});

type WebsearchParams = Static<typeof WebsearchParams>;

interface ExaSearchResult {
	title?: string;
	url: string;
	highlights?: string[];
	summary?: string;
}

interface ExaSearchResponse {
	requestId: string;
	searchType?: string;
	results: ExaSearchResult[];
	costDollars?: {
		total?: number;
	};
}

export default function websearch(pi: ExtensionAPI) {
	pi.registerTool({
		name: "websearch",
		label: "websearch",
		description: "Search the internet with Exa.",
		parameters: WebsearchParams,

		async execute(_toolCallId, params: WebsearchParams, signal) {
			const apiKey = process.env.EXA_API_KEY;
			if (!apiKey) {
				throw new Error("Missing EXA_API_KEY environment variable.");
			}

			const response = await fetch("https://api.exa.ai/search", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": apiKey,
				},
				body: JSON.stringify(params),
				signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Exa search failed (${response.status}): ${errorText}`);
			}

			const result = (await response.json()) as ExaSearchResponse;
			const lines = result.results.flatMap((entry, index) => {
				const highlights = entry.highlights?.map((highlight) => `  - ${highlight}`) ?? [];
				return [`${index + 1}. ${entry.title || entry.url}`, `   ${entry.url}`, ...highlights];
			});

			return {
				content: [
					{
						type: "text",
						text: lines.length > 0 ? lines.join("\n") : "No results found.",
					},
				],
				details: result,
			};
		},
	});
}

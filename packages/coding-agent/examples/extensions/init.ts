/**
 * Init Command Extension
 *
 * Registers /init, a slash command that wraps a reusable project-initialization
 * prompt and sends it to the active model as a normal user message.
 *
 * Usage:
 *   /init
 *   /init add a custom OAuth provider for our internal gateway
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const buildInitPrompt = (): string => {
	return `# Objective

Initialize project AI context using a mixed strategy of "concise at root + detailed at module level":

- Generate/update \`AGENTS.md\` at repository root (high-level vision, architecture overview, module index, global standards).
- Generate/update local \`AGENTS.md\` in identified module directories (interfaces, dependencies, entry points, tests, key files, etc.).
- ✨ **For improved readability, automatically generate Mermaid structure diagrams in the root \`AGENTS.md\` and add navigation breadcrumbs to each module \`AGENTS.md\`**.

## Execution Strategy (Agent adapts automatically, no user parameters needed)

- **Stage A: Repository Census (Lightweight)**
  Quickly count files and directories, identify module roots (package.json, pyproject.toml, go.mod, apps/_, packages/_, services/*, etc.).
- **Stage B: Module Priority Scanning (Medium)**
  For each module, perform targeted reading and sampling of "entry/interfaces/dependencies/tests/data models/quality tools".
- **Stage C: Deep Supplementation (As Needed)**
  If repository is small or module scale is small, expand reading scope; if large, perform batch supplemental scanning on high-risk/high-value paths.

## Security and Boundaries

- Only read/write documentation and indexes, do not modify source code.
- Ignore common generated artifacts and binary large files by default.
- Print "summary" in main dialog, write full content to repository.

## Output Requirements

- Print "Initialization Result Summary" in main dialog, including:
  - Whether root-level \`AGENTS.md\` was created/updated, major section overview.
  - Number of identified modules and their path list.
  - Generation/update status of each module's \`AGENTS.md\`.
  - ✨ **Explicitly mention "Generated Mermaid structure diagram" and "Added navigation breadcrumbs for N modules"**.
  - Coverage and major gaps.
  - If not fully read: explain "why stopped here" and list **recommended next steps** (e.g., "suggest priority supplemental scanning: packages/auth/src/controllers").
`;
};

export default function initCommandExtension(pi: ExtensionAPI) {
	pi.registerCommand("init", {
		description: "Send a reusable initialization prompt to the agent",
		handler: async (_, ctx) => {
			const prompt = buildInitPrompt();

			if (ctx.isIdle()) {
				pi.sendUserMessage(prompt);
				return;
			}

			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
			ctx.ui.notify("Init request queued", "info");
		},
	});
}

/**
 * Pi Rules Extension
 *
 * Scans the project's .pi/rules/ folder for rule files, reads their contents,
 * and injects them into the system prompt.
 *
 * Best practices for .pi/rules/:
 * - Keep rules focused: Each file should cover one topic (e.g., testing.md, api-design.md)
 * - Use descriptive filenames: The filename should indicate what the rules cover
 * - Use conditional rules sparingly: Only add paths frontmatter when rules truly apply to specific file types
 * - Organize with subdirectories: Group related rules (e.g., frontend/, backend/)
 *
 * Usage:
 * 1. Copy this file to ~/.pi/agent/extensions/ or your project's .pi/extensions/
 * 2. Create .pi/rules/ folder in your project root
 * 3. Add .md files with your rules
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

interface ProjectRule {
	path: string;
	content: string;
}

/**
 * Recursively read all .md files in a directory
 */
function readMarkdownRules(dir: string, basePath: string = ""): ProjectRule[] {
	const results: ProjectRule[] = [];

	if (!fs.existsSync(dir)) {
		return results;
	}

	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries) {
		const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
		const absolutePath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			results.push(...readMarkdownRules(absolutePath, relativePath));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			results.push({
				path: relativePath,
				content: fs.readFileSync(absolutePath, "utf8").trim(),
			});
		}
	}

	return results;
}

export default function piRulesExtension(pi: ExtensionAPI) {
	let rules: ProjectRule[] = [];

	// Scan for rules on session start
	pi.on("session_start", async (_event, ctx) => {
		const rulesDir = path.join(ctx.cwd, ".pi", "rules");
		rules = readMarkdownRules(rulesDir);

		if (rules.length > 0) {
			ctx.ui.notify(`Loaded ${rules.length} rule(s) from .pi/rules/`, "info");
		}
	});

	// Append rule contents to system prompt
	pi.on("before_agent_start", async (event) => {
		if (rules.length === 0) {
			return;
		}

		const rulesPrompt = rules
			.map(
				(rule) => `### .pi/rules/${rule.path}

${rule.content || "(empty file)"}`,
			)
			.join("\n\n");

		return {
			systemPrompt:
				event.systemPrompt +
				`

## Project Rules

The following project rules were loaded from .pi/rules/ and must be followed:

${rulesPrompt}
`,
		};
	});
}

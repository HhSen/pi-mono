/**
 * Autotest Command Extension
 *
 * Registers /autotest, a slash command that wraps a reusable testing prompt
 * and sends it to the active model as a normal user message.
 *
 * Usage:
 *   /autotest fix flaky login form test
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const buildAutotestPrompt = (pathToCase: string): string =>
	`Help complete the end2end test with detailed description in \`${pathToCase}\`

# Case Description

The test case will be placed in \`${pathToCase}\`. Each case will include:
- description.md: case description with step-by-step interactions and expected results

## Conclusion

You should make a conclusion of the result of the test, with key screenshots to illustrate the state of the application.
`;

export default function autotestCommandExtension(pi: ExtensionAPI) {
	pi.registerCommand("autotest", {
		description: "Start testing end2end cases",
		handler: async (args, ctx) => {
			const pathToCase = args.trim();

			if (!pathToCase) {
				ctx.ui.notify("Usage: /autotest <path to the case description>", "warning");
				return;
			}

			const prompt = buildAutotestPrompt(pathToCase);

			if (ctx.isIdle()) {
				pi.sendUserMessage(prompt);
				return;
			}

			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
			ctx.ui.notify("Autotest request queued", "info");
		},
	});
}

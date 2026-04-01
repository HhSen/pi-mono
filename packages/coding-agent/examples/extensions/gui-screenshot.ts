/**
 * This extension keeps a live screenshot of the active Android device screen in model context.
 * Before each model call it captures the current screen via adb, removes any previous
 * screenshot message that was injected by this extension, and appends a fresh one.
 *
 * Requirements:
 *   - adb in PATH and a single Android device connected (or ANDROID_SERIAL set)
 *
 * Start pi with this extension:
 *   pi -e ./examples/extensions/gui-screenshot.ts
 *   pi -e ./examples/extensions/gui-screenshot.ts --gui-screenshot off
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ImageContent, UserMessage } from "@mariozechner/pi-ai";
import type { ContextEvent, ExtensionAPI } from "@mariozechner/pi-coding-agent";

/** Marker text prepended to the injected user message so we can identify it later. */
const SCREENSHOT_MARKER = "__gui_screenshot__";
const GUI_SCREENSHOT_FLAG = "gui-screenshot";

/** Capture a screenshot from the connected Android device and return base64 PNG data. */
function captureAndroidScreenshot(): string | null {
	const remotePath = "/sdcard/__pi_screenshot_tmp__.png";
	const localPath = join(tmpdir(), "__pi_screenshot_tmp__.png");
	try {
		execSync(`adb shell screencap -p ${remotePath}`, { stdio: "pipe" });
		execSync(`adb pull ${remotePath} ${localPath}`, { stdio: "pipe" });
		execSync(`adb shell rm -f ${remotePath}`, { stdio: "pipe" });
		if (!existsSync(localPath)) return null;
		const data = readFileSync(localPath).toString("base64");
		unlinkSync(localPath);
		return data;
	} catch {
		return null;
	}
}

/** Return true if a message is the injected screenshot user message. */
function isScreenshotMessage(msg: AgentMessage): boolean {
	if (msg.role !== "user") return false;
	if (typeof msg.content === "string") return false;
	if (!Array.isArray(msg.content)) return false;
	return msg.content.some((part) => part.type === "text" && part.text.startsWith(SCREENSHOT_MARKER));
}

function findScreenshotMessageIndex(messages: AgentMessage[]): number {
	return messages.findIndex((msg) => isScreenshotMessage(msg));
}

function isGuiScreenshotEnabled(pi: ExtensionAPI): boolean {
	const value = pi.getFlag(GUI_SCREENSHOT_FLAG);
	if (typeof value !== "string") return true;
	const normalized = value.trim().toLowerCase();
	return normalized !== "off" && normalized !== "false" && normalized !== "0";
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag(GUI_SCREENSHOT_FLAG, {
		description: "Inject Android screenshots into model context (on/off)",
		type: "string",
		default: "on",
	});

	pi.on("context", (event: ContextEvent) => {
		const messages = [...event.messages];

		const screenshotMessageIndex = findScreenshotMessageIndex(messages);
		if (screenshotMessageIndex !== -1) {
			messages.splice(screenshotMessageIndex, 1);
		}

		if (!isGuiScreenshotEnabled(pi)) {
			return { messages };
		}

		const base64 = captureAndroidScreenshot();
		if (base64 === null) {
			// Could not capture — return messages without any screenshot.
			return { messages };
		}

		const imageContent: ImageContent = {
			type: "image",
			data: base64,
			mimeType: "image/png",
		};

		const screenshotMessage: UserMessage = {
			role: "user",
			content: [{ type: "text", text: `${SCREENSHOT_MARKER}\nCurrent screen:` }, imageContent],
			timestamp: Date.now(),
		};

		if (screenshotMessageIndex !== -1) {
			messages.splice(screenshotMessageIndex, 0, screenshotMessage);
		} else {
			messages.push(screenshotMessage);
		}
		return { messages };
	});
}

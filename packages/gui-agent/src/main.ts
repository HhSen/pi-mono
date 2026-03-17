/**
 * Main entry point for the generic agent CLI.
 *
 * Minimal agent using pi-coding-agent's SDK with the same tools and resource
 * loading strategy as coding-agent but with a simpler system prompt.
 */
import type { ImageContent } from "@mariozechner/pi-ai";
import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	InteractiveMode,
	ModelRegistry,
	runPrintMode,
	runRpcMode,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";
import { z } from "zod";

import { APP_NAME, getAgentDir, VERSION } from "./config.js";
import { DEFAULT_SANDBOX_API_URL } from "./constants.js";
import SandboxToolsFactory from "./tools/aio-sandbox/index.js";

const SandboxRuntimeBinarySchema = z.object({
	ver: z.string(),
	bin: z.string(),
	alias: z.array(z.string()),
});

const SandboxSystemDetailSchema = z.object({
	os: z.string(),
	os_version: z.string(),
	arch: z.string(),
	user: z.string(),
	home_dir: z.string(),
	timezone: z.string(),
	occupied_ports: z.array(z.string()),
});

const SandboxUtilityToolSchema = z.object({
	name: z.string(),
	description: z.string(),
});

const SandboxUtilityCategorySchema = z.object({
	category: z.string(),
	tools: z.array(SandboxUtilityToolSchema),
});

const SandboxDetailSchema = z.object({
	system: SandboxSystemDetailSchema,
	runtime: z.object({
		python: z.array(SandboxRuntimeBinarySchema),
		nodejs: z.array(SandboxRuntimeBinarySchema),
	}),
	utils: z.array(SandboxUtilityCategorySchema),
});

const SandboxInfoResponseSchema = z.object({
	success: z.literal(true),
	message: z.string(),
	data: z.null(),
	hint: z.string(),
	home_dir: z.string(),
	version: z.string(),
	detail: SandboxDetailSchema,
});

async function getCwd() {
	const fallbackCwd = process.cwd();

	try {
		const response = await fetch(`${DEFAULT_SANDBOX_API_URL}/v1/sandbox`);
		if (!response.ok) {
			const errorText = await response.text();
			console.warn(`Failed to fetch sandbox context: HTTP ${response.status}${errorText ? ` - ${errorText}` : ""}`);
			return fallbackCwd;
		}

		const data = await response.json();
		const sandboxContext = SandboxInfoResponseSchema.parse(data);
		return sandboxContext.home_dir;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.warn(`Failed to fetch sandbox context: ${message}`);
		return fallbackCwd;
	}
}

// =============================================================================
// System Prompt
// =============================================================================

/**
 * Build the generic system prompt preamble.
 */
function buildGenericSystemPrompt(): string {
	return `
		You are a helpful assistant. 
		You will actively use your skills to solve user tasks.
	`;
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CliArgs {
	help: boolean;
	version: boolean;
	message?: string;
	noSession: boolean;
	mode: "interactive" | "print" | "rpc";
}

function parseCliArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		help: false,
		version: false,
		noSession: false,
		mode: "interactive",
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			args.help = true;
		} else if (arg === "--version" || arg === "-v") {
			args.version = true;
		} else if (arg === "--no-session") {
			args.noSession = true;
		} else if ((arg === "--mode" || arg === "-M") && i + 1 < argv.length) {
			const mode = argv[++i];
			if (mode === "interactive" || mode === "print" || mode === "rpc") {
				args.mode = mode;
			}
		} else if ((arg === "--message" || arg === "-m") && i + 1 < argv.length) {
			const message = argv[++i];
			if (message !== undefined) {
				args.message = message;
				if (args.mode !== "rpc") {
					args.mode = "print";
				}
			}
		} else if (arg && !arg.startsWith("-")) {
			// Positional argument treated as message
			args.message = arg;
			if (args.mode !== "rpc") {
				args.mode = "print";
			}
		}
	}

	return args;
}

function printHelp(): void {
	console.log(`${APP_NAME} v${VERSION}

Usage: ${APP_NAME} [options] [message]

Options:
  -M, --mode <interactive|print|rpc>
                        Select frontend/runtime mode
  -m, --message <text>  Send a single message and exit (non-interactive)
  --no-session          Start without session persistence
  -v, --version         Show version
  -h, --help            Show this help message

Examples:
  ${APP_NAME}                              Start interactive mode
  ${APP_NAME} "list files here"            Send a message and exit
  ${APP_NAME} --mode print -m "what is 2+2" Run one prompt in print mode
  ${APP_NAME} --mode rpc                   Start headless JSON-RPC mode
`);
}

// =============================================================================
// Main
// =============================================================================

export async function main(argv: string[] = []): Promise<void> {
	const args = parseCliArgs(argv);

	if (args.help) {
		printHelp();
		return;
	}

	if (args.version) {
		console.log(VERSION);
		return;
	}

	const cwd = await getCwd();
	const agentDir = getAgentDir();

	const authStorage = AuthStorage.create();
	const modelRegistry = new ModelRegistry(authStorage);
	const settingsManager = SettingsManager.create(cwd, agentDir);

	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		systemPromptOverride: () => buildGenericSystemPrompt(),
		extensionFactories: [SandboxToolsFactory],
	});
	await resourceLoader.reload();

	const sessionManager = args.noSession ? SessionManager.inMemory() : SessionManager.continueRecent(cwd);

	const { session, modelFallbackMessage } = await createAgentSession({
		cwd,
		agentDir,
		authStorage,
		modelRegistry,
		settingsManager,
		tools: [], // remove all default tools
		resourceLoader,
		sessionManager,
	});

	if (args.mode === "rpc") {
		await runRpcMode(session);
		return;
	}

	if (args.mode === "print" && args.message) {
		await runPrintMode(session, {
			mode: "text",
			initialMessage: args.message,
		});
		session.dispose();
		return;
	}

	// Interactive mode
	const images: ImageContent[] = [];
	const mode = new InteractiveMode(session, {
		...(modelFallbackMessage !== undefined ? { modelFallbackMessage } : {}),
		...(args.message !== undefined ? { initialMessage: args.message } : {}),
		initialImages: images,
	});

	await mode.run();
}

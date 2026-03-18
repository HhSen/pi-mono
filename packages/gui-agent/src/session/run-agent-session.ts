import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
	type AgentSession,
	AuthStorage,
	createAgentSession,
	ModelRegistry,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import type { GuiAgentConfig } from "../config.js";
import { mapAgentSessionEvent } from "./event-mapper.js";
import type { ApiStreamEvent, GuiAgentRuntime, ModelSelector, StreamRequest } from "./types.js";

interface RunStatelessAgentSessionOptions {
	runtime: GuiAgentRuntime;
	preparedRequest: PreparedStreamRequest;
	signal: AbortSignal;
	onEvent: (event: ApiStreamEvent) => void;
}

type ResolvedModel = NonNullable<ReturnType<ModelRegistry["find"]>>;

export interface PreparedStreamRequest {
	request: StreamRequest;
	cwd: string;
	model?: ResolvedModel;
}

function assertStreamRequest(request: StreamRequest, config: GuiAgentConfig): void {
	if (!request || typeof request !== "object") {
		throw new Error("Request body must be a JSON object");
	}

	if (typeof request.message !== "string" || request.message.trim().length === 0) {
		throw new Error("Field 'message' must be a non-empty string");
	}

	if (request.message.length > config.maxPromptChars) {
		throw new Error(`Field 'message' exceeds ${config.maxPromptChars} characters`);
	}

	if (request.cwd !== undefined && typeof request.cwd !== "string") {
		throw new Error("Field 'cwd' must be a string when provided");
	}

	if (request.model !== undefined) {
		assertModelSelector(request.model);
	}

	if (
		request.thinkingLevel !== undefined &&
		!["off", "minimal", "low", "medium", "high", "xhigh"].includes(request.thinkingLevel)
	) {
		throw new Error("Field 'thinkingLevel' must be one of: off, minimal, low, medium, high, xhigh");
	}
	if (request.metadata !== undefined && (typeof request.metadata !== "object" || request.metadata === null)) {
		throw new Error("Field 'metadata' must be an object when provided");
	}
}

function assertModelSelector(model: ModelSelector): void {
	if (typeof model !== "object" || model === null) {
		throw new Error("Field 'model' must be an object when provided");
	}

	if (typeof model.provider !== "string" || model.provider.trim().length === 0) {
		throw new Error("Field 'model.provider' must be a non-empty string");
	}

	if (typeof model.id !== "string" || model.id.trim().length === 0) {
		throw new Error("Field 'model.id' must be a non-empty string");
	}
}

async function resolveRequestCwd(runtime: GuiAgentRuntime, inputCwd?: string): Promise<string> {
	const cwd = inputCwd ? resolve(runtime.config.defaultCwd, inputCwd) : runtime.config.defaultCwd;
	const relativePath = relative(runtime.config.defaultCwd, cwd);
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		throw new Error(`Field 'cwd' must stay within ${runtime.config.defaultCwd}`);
	}
	const stats = await stat(cwd);
	if (!stats.isDirectory()) {
		throw new Error(`Not a directory: ${cwd}`);
	}
	return cwd;
}

function resolveRequestModel(runtime: GuiAgentRuntime, selector?: ModelSelector): ResolvedModel | undefined | null {
	if (!selector) {
		return undefined;
	}

	return runtime.modelRegistry.find(selector.provider, selector.id) ?? null;
}

export async function prepareStreamRequest(
	runtime: GuiAgentRuntime,
	request: StreamRequest,
): Promise<PreparedStreamRequest> {
	assertStreamRequest(request, runtime.config);

	const cwd = await resolveRequestCwd(runtime, request.cwd);
	const model = resolveRequestModel(runtime, request.model);
	if (model === null) {
		throw new Error(
			`Unknown model '${request.model?.provider}/${request.model?.id}'. Configure a built-in or custom model first.`,
		);
	}

	return {
		request,
		cwd,
		...(model ? { model } : {}),
	};
}

function emitSessionStart(
	session: AgentSession,
	cwd: string,
	request: StreamRequest,
	onEvent: (event: ApiStreamEvent) => void,
) {
	onEvent({
		type: "session_start",
		sessionId: session.sessionId,
		cwd,
		...(session.model?.id ? { modelId: session.model.id } : {}),
		...(session.model?.provider ? { provider: session.model.provider } : {}),
		thinkingLevel: request.thinkingLevel ?? session.thinkingLevel,
	});
}

export function createGuiAgentRuntime(config: GuiAgentConfig): GuiAgentRuntime {
	const authStorage = AuthStorage.create(config.agentDir ? resolve(config.agentDir, "auth.json") : undefined);
	const modelRegistry = new ModelRegistry(
		authStorage,
		config.agentDir ? resolve(config.agentDir, "models.json") : undefined,
	);

	return {
		config,
		authStorage,
		modelRegistry,
	};
}

export async function runStatelessAgentSession(options: RunStatelessAgentSessionOptions): Promise<void> {
	const { cwd, model, request } = options.preparedRequest;

	let session: AgentSession | undefined;
	let unsubscribe: (() => void) | undefined;
	let isDisposed = false;

	const abortSession = async () => {
		if (!session || isDisposed) {
			return;
		}
		try {
			await session.abort();
		} finally {
			unsubscribe?.();
			session.dispose();
			isDisposed = true;
		}
	};

	const onAbort = () => {
		void abortSession();
	};
	options.signal.addEventListener("abort", onAbort, { once: true });

	try {
		const created = await createAgentSession({
			cwd,
			authStorage: options.runtime.authStorage,
			modelRegistry: options.runtime.modelRegistry,
			sessionManager: SessionManager.inMemory(),
			...(options.runtime.config.agentDir ? { agentDir: options.runtime.config.agentDir } : {}),
			...(model ? { model } : {}),
			...(request.thinkingLevel ? { thinkingLevel: request.thinkingLevel } : {}),
		});

		session = created.session;
		emitSessionStart(session, cwd, request, options.onEvent);

		unsubscribe = session.subscribe((event) => {
			const mapped = mapAgentSessionEvent(event);
			if (mapped) {
				options.onEvent(mapped);
			}
		});

		if (options.signal.aborted) {
			return;
		}

		await session.prompt(request.message);
	} catch (error) {
		if (options.signal.aborted) {
			return;
		}

		options.onEvent({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
		throw error;
	} finally {
		options.signal.removeEventListener("abort", onAbort);
		if (session && !isDisposed) {
			unsubscribe?.();
			session.dispose();
		}
	}
}

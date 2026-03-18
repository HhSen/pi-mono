import type { Request, Response } from "express";
import { Router } from "express";
import { prepareStreamRequest, runStatelessAgentSession } from "../session/run-agent-session.js";
import type { GuiAgentRuntime, StreamRequest } from "../session/types.js";

function writeSse(response: Response, event: string, data: unknown): void {
	if (response.writableEnded || response.destroyed) {
		return;
	}

	response.write(`event: ${event}\n`);
	response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function initializeSse(response: Response): void {
	response.status(200);
	response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
	response.setHeader("Cache-Control", "no-cache, no-transform");
	response.setHeader("Connection", "keep-alive");
	response.setHeader("X-Accel-Buffering", "no");
	response.flushHeaders();
	response.write(": connected\n\n");
}

export function createStreamRouter(runtime: GuiAgentRuntime): Router {
	const router = Router();

	router.post("/api/v1/stream", async (request: Request, response: Response) => {
		let preparedRequest: Awaited<ReturnType<typeof prepareStreamRequest>>;
		try {
			preparedRequest = await prepareStreamRequest(runtime, request.body as StreamRequest);
		} catch (error) {
			response.status(400).json({
				error: error instanceof Error ? error.message : String(error),
			});
			return;
		}

		initializeSse(response);

		const abortController = new AbortController();
		response.on("close", () => {
			if (!response.writableEnded) {
				abortController.abort();
			}
		});

		try {
			await runStatelessAgentSession({
				runtime,
				preparedRequest,
				signal: abortController.signal,
				onEvent: (event) => {
					writeSse(response, event.type, event);
				},
			});
		} catch {
		} finally {
			if (!response.writableEnded && !response.destroyed) {
				response.end();
			}
		}
	});

	return router;
}

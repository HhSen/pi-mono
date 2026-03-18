import type { NextFunction } from "express";
import express, { type Request, type Response } from "express";
import type { GuiAgentConfig } from "./config.js";
import { createStreamRouter } from "./routes/stream.js";
import { createGuiAgentRuntime } from "./session/run-agent-session.js";

export function createGuiAgentApp(config: GuiAgentConfig) {
	const app = express();
	const runtime = createGuiAgentRuntime(config);

	app.disable("x-powered-by");
	app.use(express.json({ limit: config.requestBodyLimit }));

	app.get("/health", (_request: Request, response: Response) => {
		response.json({ ok: true });
	});

	app.use(createStreamRouter(runtime));

	app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
		if (response.headersSent) {
			next(error);
			return;
		}

		const status = getErrorStatus(error);
		const message = error instanceof Error ? error.message : "Internal server error";
		response.status(status).json({ error: message });
	});

	return app;
}

function getErrorStatus(error: unknown): number {
	if (typeof error === "object" && error !== null) {
		if ("status" in error && typeof error.status === "number") {
			return error.status;
		}

		if ("statusCode" in error && typeof error.statusCode === "number") {
			return error.statusCode;
		}
	}

	return error instanceof SyntaxError ? 400 : 500;
}

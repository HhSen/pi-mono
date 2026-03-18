import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { createGuiAgentApp } from "./server.js";

const config = loadConfig();
const app = createGuiAgentApp(config);
const server = createServer(app);

server.listen(config.port, config.host, () => {
	logger.info(`gui-agent listening on http://${config.host}:${config.port}`);
});

const shutdown = () => {
	server.close((error) => {
		if (error) {
			logger.error("Error during shutdown", error);
			process.exitCode = 1;
		}
	});
	setTimeout(() => {
		process.exit(process.exitCode ?? 0);
	}, 1000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

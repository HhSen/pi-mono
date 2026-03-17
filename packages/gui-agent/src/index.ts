// Re-export core SDK surface from coding-agent for users of this package
export {
	AuthStorage,
	bashTool,
	type CreateAgentSessionOptions,
	type CreateAgentSessionResult,
	codingTools,
	createAgentSession,
	createBashTool,
	createCodingTools,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadOnlyTools,
	createReadTool,
	createWriteTool,
	DefaultResourceLoader,
	type ExtensionAPI,
	type ExtensionFactory,
	editTool,
	findTool,
	grepTool,
	InteractiveMode,
	type InteractiveModeOptions,
	lsTool,
	ModelRegistry,
	type PromptTemplate,
	type ResourceLoader,
	readOnlyTools,
	readTool,
	runPrintMode,
	runRpcMode,
	SessionManager,
	SettingsManager,
	type Skill,
	type ToolDefinition,
	writeTool,
} from "@mariozechner/pi-coding-agent";

// Local config exports
export { APP_NAME, getAgentDir, VERSION } from "./config.js";
// Main entry point
export { main } from "./main.js";
// Custom tools
export { createBashTool as createSandboxBashTool, type SandboxBashToolOptions } from "./tools/aio-sandbox/bash.js";
export { createReadTool as createSandboxReadTool, type SandboxReadToolOptions } from "./tools/aio-sandbox/read.js";
export {
	createReplaceTool as createSandboxReplaceTool,
	type SandboxReplaceToolOptions,
} from "./tools/aio-sandbox/replace.js";
export {
	createSearchTool as createSandboxSearchTool,
	type SandboxSearchToolOptions,
} from "./tools/aio-sandbox/search.js";
export { createWriteTool as createSandboxWriteTool, type SandboxWriteToolOptions } from "./tools/aio-sandbox/write.js";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createBashTool } from "./bash.js";
import { createReadTool } from "./read.js";
import { createReplaceTool } from "./replace.js";
import { createSearchTool } from "./search.js";
import { createWriteTool } from "./write.js";

export default function (pi: ExtensionAPI) {
	pi.registerTool(createBashTool());
	pi.registerTool(createReadTool());
	pi.registerTool(createWriteTool());
	pi.registerTool(createReplaceTool());
	pi.registerTool(createSearchTool());
}

import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Package Asset Paths
// =============================================================================

/** Get path to package.json */
function getPackageJsonPath(): string {
	// Walk up from __dirname until we find package.json
	let dir = __dirname;
	while (dir !== dirname(dir)) {
		const candidate = join(dir, "package.json");
		try {
			readFileSync(candidate);
			return candidate;
		} catch {
			dir = dirname(dir);
		}
	}
	return join(__dirname, "package.json");
}

// =============================================================================
// App Config (from package.json)
// =============================================================================

const pkg = JSON.parse(readFileSync(getPackageJsonPath(), "utf-8"));

export const APP_NAME: string = (pkg.genericAgentConfig as { name?: string })?.name ?? "generic-agent";
export const VERSION: string = pkg.version as string;

// Re-export so consumers of this package only need one import
export { getAgentDir };

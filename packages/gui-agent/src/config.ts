import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface GuiAgentConfig {
	host: string;
	port: number;
	defaultCwd: string;
	requestBodyLimit: string;
	maxPromptChars: number;
	agentDir?: string;
}

interface RawConfig {
	host?: unknown;
	port?: unknown;
	defaultCwd?: unknown;
	requestBodyLimit?: unknown;
	maxPromptChars?: unknown;
	agentDir?: unknown;
}

function parsePort(value: unknown, fallback: number): number {
	if (value === undefined || value === null) {
		return fallback;
	}

	const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`Invalid port: ${value}`);
	}

	return parsed;
}

function parseMaxPromptChars(value: unknown, fallback: number): number {
	if (value === undefined || value === null) {
		return fallback;
	}

	const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`Invalid maxPromptChars: ${value}`);
	}

	return parsed;
}

function parseString(value: unknown, field: string): string | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new Error(`Field '${field}' must be a string`);
	}
	return value;
}

export function loadConfig(configPath?: string): GuiAgentConfig {
	const resolvedPath = configPath ? resolve(configPath) : resolve(process.cwd(), "config.json");

	let raw: RawConfig = {};
	try {
		const text = readFileSync(resolvedPath, "utf8");
		const parsed: unknown = JSON.parse(text);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error("config.json must be a JSON object");
		}
		raw = parsed as RawConfig;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
		// No config file — use defaults
	}

	const config: GuiAgentConfig = {
		host: parseString(raw.host, "host") ?? "127.0.0.1",
		port: parsePort(raw.port, 3000),
		defaultCwd: resolve(parseString(raw.defaultCwd, "defaultCwd") ?? process.cwd()),
		requestBodyLimit: parseString(raw.requestBodyLimit, "requestBodyLimit") ?? "1mb",
		maxPromptChars: parseMaxPromptChars(raw.maxPromptChars, 100_000),
	};

	const agentDir = parseString(raw.agentDir, "agentDir");
	if (agentDir) {
		config.agentDir = resolve(agentDir);
	}

	return config;
}

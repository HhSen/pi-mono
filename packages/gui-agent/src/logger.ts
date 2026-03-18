type LogLevel = "info" | "warn" | "error";

function formatLine(level: LogLevel, message: string): string {
	const timestamp = new Date().toISOString();
	return `${timestamp} [${level.toUpperCase()}] ${message}`;
}

function write(level: LogLevel, message: string, ...args: unknown[]): void {
	const extras =
		args.length > 0
			? ` ${args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : JSON.stringify(a))).join(" ")}`
			: "";
	process.stdout.write(`${formatLine(level, message)}${extras}\n`);
}

export const logger = {
	info(message: string, ...args: unknown[]): void {
		write("info", message, ...args);
	},

	warn(message: string, ...args: unknown[]): void {
		write("warn", message, ...args);
	},

	error(message: string, ...args: unknown[]): void {
		write("error", message, ...args);
	},
};

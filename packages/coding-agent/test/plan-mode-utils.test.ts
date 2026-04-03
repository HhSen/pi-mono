import { describe, expect, it } from "vitest";
import {
	DEFAULT_NORMAL_MODE_TOOLS,
	getExecutionModeTools,
	getNormalModeTools,
	isSafeCommand,
} from "../examples/extensions/plan-mode/utils.js";

describe("plan mode tool helpers", () => {
	describe("getNormalModeTools", () => {
		it("filters plan-only tools out of the normal tool set", () => {
			expect(
				getNormalModeTools([
					"read",
					"bash",
					"edit",
					"write",
					"plan_add_todo",
					"plan_remove_todo",
					"plan_complete_todo",
				]),
			).toEqual(["read", "bash", "edit", "write"]);
		});

		it("falls back to the default coding tools when only plan tools are active", () => {
			expect(getNormalModeTools(["plan_add_todo", "plan_remove_todo", "plan_complete_todo"])).toEqual(
				DEFAULT_NORMAL_MODE_TOOLS,
			);
		});
	});

	describe("getExecutionModeTools", () => {
		it("adds execution-only todo tools without duplicating them", () => {
			expect(getExecutionModeTools(["read", "bash", "edit", "write", "plan_remove_todo"])).toEqual([
				"read",
				"bash",
				"edit",
				"write",
				"plan_remove_todo",
				"plan_complete_todo",
			]);
		});
	});
});

describe("isSafeCommand", () => {
	describe("safe commands", () => {
		it("allows basic read commands", () => {
			expect(isSafeCommand("ls -la")).toBe(true);
			expect(isSafeCommand("cat file.txt")).toBe(true);
			expect(isSafeCommand("head -n 10 file.txt")).toBe(true);
			expect(isSafeCommand("tail -f log.txt")).toBe(true);
			expect(isSafeCommand("grep pattern file")).toBe(true);
			expect(isSafeCommand("find . -name '*.ts'")).toBe(true);
		});

		it("allows git read commands", () => {
			expect(isSafeCommand("git status")).toBe(true);
			expect(isSafeCommand("git log --oneline")).toBe(true);
			expect(isSafeCommand("git diff")).toBe(true);
			expect(isSafeCommand("git branch")).toBe(true);
		});

		it("allows npm/yarn read commands", () => {
			expect(isSafeCommand("npm list")).toBe(true);
			expect(isSafeCommand("npm outdated")).toBe(true);
			expect(isSafeCommand("yarn info react")).toBe(true);
		});

		it("allows other safe commands", () => {
			expect(isSafeCommand("pwd")).toBe(true);
			expect(isSafeCommand("echo hello")).toBe(true);
			expect(isSafeCommand("wc -l file.txt")).toBe(true);
			expect(isSafeCommand("du -sh .")).toBe(true);
			expect(isSafeCommand("df -h")).toBe(true);
		});
	});

	describe("destructive commands", () => {
		it("blocks file modification commands", () => {
			expect(isSafeCommand("rm file.txt")).toBe(false);
			expect(isSafeCommand("rm -rf dir")).toBe(false);
			expect(isSafeCommand("mv old new")).toBe(false);
			expect(isSafeCommand("cp src dst")).toBe(false);
			expect(isSafeCommand("mkdir newdir")).toBe(false);
			expect(isSafeCommand("touch newfile")).toBe(false);
		});

		it("blocks git write commands", () => {
			expect(isSafeCommand("git add .")).toBe(false);
			expect(isSafeCommand("git commit -m 'msg'")).toBe(false);
			expect(isSafeCommand("git push")).toBe(false);
			expect(isSafeCommand("git checkout main")).toBe(false);
			expect(isSafeCommand("git reset --hard")).toBe(false);
		});

		it("blocks package manager installs", () => {
			expect(isSafeCommand("npm install lodash")).toBe(false);
			expect(isSafeCommand("yarn add react")).toBe(false);
			expect(isSafeCommand("pip install requests")).toBe(false);
			expect(isSafeCommand("brew install node")).toBe(false);
		});

		it("blocks redirects", () => {
			expect(isSafeCommand("echo hello > file.txt")).toBe(false);
			expect(isSafeCommand("cat foo >> bar")).toBe(false);
			expect(isSafeCommand(">file.txt")).toBe(false);
		});

		it("blocks dangerous commands", () => {
			expect(isSafeCommand("sudo rm -rf /")).toBe(false);
			expect(isSafeCommand("kill -9 1234")).toBe(false);
			expect(isSafeCommand("reboot")).toBe(false);
		});

		it("blocks editors", () => {
			expect(isSafeCommand("vim file.txt")).toBe(false);
			expect(isSafeCommand("nano file.txt")).toBe(false);
			expect(isSafeCommand("code .")).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("requires command to be in safe list (not just non-destructive)", () => {
			expect(isSafeCommand("unknown-command")).toBe(false);
			expect(isSafeCommand("my-script.sh")).toBe(false);
		});

		it("handles commands with leading whitespace", () => {
			expect(isSafeCommand("  ls -la")).toBe(true);
			expect(isSafeCommand("  rm file")).toBe(false);
		});
	});
});

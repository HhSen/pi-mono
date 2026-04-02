# Plan Mode Extension

Read-only exploration mode for safe code analysis.

## Features

- **Read-only tools**: Restricts available tools to read, bash, grep, find, ls, questionnaire, plan_add_todo
- **Bash allowlist**: Only read-only bash commands are allowed
- **plan_add_todo tool**: LLM explicitly adds steps during planning (no regex parsing)
- **plan_complete_todo tool**: LLM explicitly marks steps done during execution (no [DONE:n] markers)
- **Progress tracking**: Widget shows completion status during execution
- **Session persistence**: State survives session resume

## Commands

- `/plan` - Toggle plan mode
- `/todos` - Show current plan progress
- `Ctrl+Alt+P` - Toggle plan mode (shortcut)

## Usage

1. Enable plan mode with `/plan` or `--plan` flag
2. Ask the agent to analyze code and create a plan
3. The agent calls `plan_add_todo` for each planned step:

```
plan_add_todo("Analyze existing test structure")
plan_add_todo("Identify missing coverage for auth module")
plan_add_todo("Write unit tests for login flow")
```

4. Choose "Execute the plan" when prompted
5. During execution, the agent calls `plan_complete_todo(step)` after finishing each step
6. Progress widget shows completion status

## How It Works

### Plan Mode (Read-Only)
- Only read-only tools available, plus `plan_add_todo`
- Bash commands filtered through allowlist
- Agent builds the plan by calling `plan_add_todo` for each step
- No text-parsing or `Plan:` header format required

### Execution Mode
- Full tool access restored, plus `plan_complete_todo`
- Agent executes steps in order
- Agent calls `plan_complete_todo(step)` after completing each step
- Widget shows progress

### Command Allowlist

Safe commands (allowed):
- File inspection: `cat`, `head`, `tail`, `less`, `more`
- Search: `grep`, `find`, `rg`, `fd`
- Directory: `ls`, `pwd`, `tree`
- Git read: `git status`, `git log`, `git diff`, `git branch`
- Package info: `npm list`, `npm outdated`, `yarn info`
- System info: `uname`, `whoami`, `date`, `uptime`

Blocked commands:
- File modification: `rm`, `mv`, `cp`, `mkdir`, `touch`
- Git write: `git add`, `git commit`, `git push`
- Package install: `npm install`, `yarn add`, `pip install`
- System: `sudo`, `kill`, `reboot`
- Editors: `vim`, `nano`, `code`

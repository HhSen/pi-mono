# @mariozechner/pi-generic-agent

A minimal agent built on the [`@mariozechner/pi-coding-agent`](../coding-agent/README.md) SDK. Provides the same tools and resource loading as the coding agent but with a simpler, customizable system prompt. Use it as a starting point for building your own agent products without forking the coding agent.

## Installation

```bash
npm install -g @mariozechner/pi-generic-agent
```

Authenticate via an API key environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
generic-agent
```

Or use any provider supported by the coding agent (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.).

---

## Modes

### Interactive (default)

Full terminal UI, same as running `pi` from the coding agent.

```bash
generic-agent
generic-agent --mode interactive
```

### Print

Send one message and exit. Output is plain text on stdout.

```bash
generic-agent "list the files here"
generic-agent --mode print -m "what is 2+2"
```

### RPC

Headless JSON-RPC mode for embedding the agent in other processes. Reads commands from stdin, writes events and responses to stdout as newline-delimited JSON.

```bash
generic-agent --mode rpc
```

The protocol is identical to the coding agent's RPC mode. See [`packages/coding-agent/src/modes/rpc/rpc-types.ts`](../coding-agent/src/modes/rpc/rpc-types.ts) for the full command/event type definitions.

**Basic RPC session:**

```bash
# Start agent
generic-agent --mode rpc &

# Send a prompt (newline-delimited JSON)
echo '{"type":"prompt","message":"what files are here?"}' | generic-agent --mode rpc
```

**Node.js integration example:**

```typescript
import { spawn } from "child_process";
import { createInterface } from "readline";

const agent = spawn("generic-agent", ["--mode", "rpc"], { stdio: ["pipe", "pipe", "inherit"] });

const rl = createInterface({ input: agent.stdout });
rl.on("line", (line) => {
  const event = JSON.parse(line);
  if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

// Send a prompt
agent.stdin.write(JSON.stringify({ type: "prompt", message: "list files here" }) + "\n");
```

---

## CLI Reference

```
Usage: generic-agent [options] [message]

Options:
  -M, --mode <interactive|print|rpc>
                        Select frontend/runtime mode (default: interactive)
  -m, --message <text>  Send a single message and exit (print mode)
  --no-session          Start without session persistence
  -v, --version         Show version
  -h, --help            Show this help message
```

---

## Resource Loading

`generic-agent` uses the same resource discovery as the coding agent:

- **Extensions** — loaded from user (`~/.generic-agent/agent/`) and project (`.generic-agent/`) directories
- **Skills** — markdown files that extend the system prompt with domain knowledge
- **Prompt templates** — slash commands defined as `.md` files
- **Themes** — color/style overrides for the TUI
- **Context files** — `AGENTS.md` / `CLAUDE.md` files discovered in the working directory tree

The agent config directory is `~/.pi/agent/` — the same directory used by the coding agent. All extensions, skills, prompt templates, themes, and auth credentials installed for `pi` are automatically available here. Override with the `PI_CODING_AGENT_DIR` environment variable.

---

## Programmatic Usage (SDK)

`generic-agent` re-exports the full coding agent SDK surface so you can use it as a dependency without depending on `pi-coding-agent` directly.

```typescript
import { createAgentSession, AuthStorage, ModelRegistry, SessionManager } from "@mariozechner/pi-generic-agent";

const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("What files are in the current directory?");
```

For the full SDK reference see [`packages/coding-agent/docs/sdk.md`](../coding-agent/docs/sdk.md).

For building TUI components see [`packages/coding-agent/docs/tui.md`](../coding-agent/docs/tui.md).

---

## Customization

The system prompt is built in [`src/main.ts`](src/main.ts) via `buildGenericSystemPrompt()`. It lists active tools and a small set of guidelines. The coding agent appends skills, context files, and the current date/time on top automatically.

To customize the prompt for your product, edit `buildGenericSystemPrompt()` or replace `systemPromptOverride` in the `DefaultResourceLoader` options.

To add tools, skills, or extensions, follow the coding agent SDK docs above.

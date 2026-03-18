# pi GUI Agent

Minimal stateless HTTP server around `@mariozechner/pi-coding-agent`.

## Endpoint

`POST /api/v1/stream`

Request body:

```json
{
  "message": "Inspect this project",
  "cwd": ".",
  "model": {
    "provider": "anthropic",
    "id": "claude-sonnet-4-5"
  },
  "thinkingLevel": "off"
}
```

Notes:
- `message` is required.
- `cwd` is optional and must stay inside the configured `GUI_AGENT_CWD`.
- Each request creates a fresh in-memory `AgentSession`.

## Response

The endpoint responds with server-sent events.

Event types:
- `session_start`
- `message_start`
- `text_delta`
- `thinking_delta`
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`
- `message_end`
- `agent_end`
- `error`

## Config

Environment variables:
- `GUI_AGENT_HOST`
- `GUI_AGENT_PORT`
- `GUI_AGENT_CWD`
- `GUI_AGENT_DIR`
- `GUI_AGENT_BODY_LIMIT`
- `GUI_AGENT_MAX_PROMPT_CHARS`

## Development

```bash
npm run dev --workspace @mariozechner/pi-gui-agent
```

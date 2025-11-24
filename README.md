# Cerebras Code CLI

Claude Code-style AI coding assistant powered by ultra-fast Cerebras inference. Build, inspect, and edit codebases directly from your terminal with lightning-fast responses (up to 2600 tokens/sec) and full project awareness.

## Features
- **Lightning Fast** – built on Cerebras inference for streaming up to 2600 tokens/sec.
- **Global CLI** – install once with `npm install -g @enkhbold470/cerebras-cli`, access from anywhere.
- **Interactive REPL** – persistent chat session with history, help, and file operations.
- **Agentic Tool Loop** – ReAct pattern (Thought → Action → Observation) with structured tool calls (`read_file`, `write_file`, `list_directory`, `search_text`, `run_bash`).
- **Hierarchical Context Loading** – loads `AGENTS.md`/`CLAUDE.md` from global (~/.cerebras/) → project root → current directory (deeper files override).
- **Slash Commands** – custom commands from `~/.cerebras/commands/*.md` with frontmatter metadata.
- **Self-Verification Tools** – built-in `verify_type_check`, `verify_lint`, `verify_format`, `verify_test` for quality assurance.
- **YOLO Mode** – `--yolo` or `--dangerously-skip-permissions` flag for automated workflows (use with caution).
- **MCP Server Support** – Model Context Protocol integration for extended tooling (configure via `~/.cerebras/mcp-servers.json`).
- **Multi-Agent Orchestration** – delegate tasks to specialist subagents for complex workflows.
- **Streaming Output** – real-time token streaming for prompts or REPL sessions.

## Installation
```bash
npm install -g @enkhbold470/cerebras-cli
```

Set the required environment variable (add to shell profile for persistence):
```bash
export CEREBRAS_API_KEY="your-api-key"
```

For verbose developer logging the CLI defaults to `NODE_ENV=debug`. Override with `NODE_ENV=production` to silence debug traces.

## Usage
Interactive REPL:
```bash
cerebras-code
# or
ccode
```

Single-prompt mode:
```bash
ccode -p "explain async/await in JavaScript"
ccode -p "review the code in src/index.ts"
ccode -p "create a React component for a todo list"
```

Custom system prompts (make sure the CLI is installed globally or reference the package explicitly):
```bash
ccode --system "Always run tests before summarizing" -p "add Vitest smoke tests"
npx @enkhbold470/cerebras-cli --system "Prefer minimal diffs" -p "refactor src/index.ts"
```

Project analysis helpers:
```bash
ccode --list-files
ccode --structure
ccode --system "You are a security auditor" -p "check for vulnerabilities"
```

Pipe data directly:
```bash
cat error.log | ccode -p "analyze this error log"
git diff | ccode -p "review these changes"
npm test 2>&1 | ccode -p "fix these failing tests"
```

### Tool Calling Protocol
Grounded in `docs/research-development.md`, the agent never emits raw HTML instructions. It speaks JSON:

- Request tooling:
  ```json
  {"tool_calls":[{"id":"call-1","name":"read_file","input":{"path":"src/index.ts","start_line":1,"end_line":60}}]}
  ```
- Provide final answers:
  ```json
  {"final_response":"Summary + verification steps + files touched"}
  ```

All tool results (file reads, writes, directory listings, bash output) feed back into the loop automatically so you get Claude Code-style reasoning directly in your terminal.

File edits also return inline `diff` blocks (with `+`/`-` prefixes) so you can inspect changes immediately without running `git diff`.

### Slash Commands & Session Reports
- `/init` – scaffold `AGENTS.md` with Codex instructions.
- `/status` – show current model, reasoning mode, approvals, mentions, and tool usage counts.
- `/approvals` – choose which tool categories (`write_file`, `run_bash`) are auto-approved.
- `/model` – switch reasoning style (fast, balanced, thorough).
- `/switch-model` – switch to a different model (with quota limits).
- `/mention <path>` – highlight files/directories the agent must focus on (`/mention clear` resets).
- `/compact` – summarize recent turns and trim context to avoid token pressure.
- `/quit` – exit and display the session summary.

Every session exit (including `Ctrl+C`) prints a report similar to Claude Code’s `/status`, covering wall time, API time, total code changes, and tool usage so you know what happened before publishing.

## Configuration

### Environment Variables
Via `.env` or shell:
```bash
CEREBRAS_API_KEY=your-api-key
CEREBRAS_MODEL=qwen-3-235b-a22b-instruct-2507  # Optional: select model
CEREBRAS_MAX_TOKENS=4096
CEREBRAS_TEMPERATURE=0.7
```

### Project Configuration
**`.cerebrasrc`** (project root):
```json
{
  "excludedPaths": ["*.test.ts", "coverage/**", "docs/**"],
  "allowedPaths": ["src/**", "lib/**"]
}
```

### Hierarchical Context Files
Context files are loaded in priority order (deeper files override):

1. **Global** (`~/.cerebras/AGENTS.md`, `~/.cerebras/CLAUDE.md`) – applies to all projects
2. **Project** (`./AGENTS.md`, `./CLAUDE.md`) – project-specific rules
3. **Directory** (`./subdir/AGENTS.md`, `./subdir/CLAUDE.md`) – directory-specific overrides

**Example `AGENTS.md`:**
```markdown
## Project Overview
Brief description of project.

## Tech Stack
- Language: TypeScript 5.2
- Framework: Next.js 14

## Do's ✅
- Use TypeScript strict mode
- Follow existing patterns

## Don'ts ❌
- Don't use `any` type
- Don't bypass authentication
```

See `docs/example-agents.md` for a complete template.

### MCP Server Configuration
**`~/.cerebras/mcp-servers.json`:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/project"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

### YOLO Mode
For automated workflows (use with caution):
```bash
ccode --yolo -p "fix all lint errors"
ccode --dangerously-skip-permissions -p "generate tests for src/utils.ts"
```

**Safety Checklist:**
- ✓ Working in Git repository with clean branch
- ✓ Created backup/commit point before YOLO
- ✓ Scoped to specific directory
- ✓ Not touching production systems
- ✓ Can review output after completion

## Model Selection

The CLI supports multiple models with automatic quota tracking to prevent exceeding limits. You can select a model via:

1. **CLI flag**: `--model <model-name>` or `-m <model-name>`
2. **Environment variable**: `CEREBRAS_MODEL=<model-name>`
3. **REPL command**: `/switch-model` (interactive model selection)

### Available Models

List all available models and their limits:
```bash
ccode --list-models
```

Available models:
- `gpt-oss-120b` - 65,536 context, 30 req/min, 900 req/hour, 14,400 req/day
- `llama-3.3-70b` - 65,536 context, 30 req/min, 900 req/hour, 14,400 req/day
- `llama3.1-8b` - 8,192 context, 30 req/min, 900 req/hour, 14,400 req/day
- `qwen-3-235b-a22b-instruct-2507` - 65,536 context, 30 req/min, 900 req/hour, 1,440 req/day (default)
- `qwen-3-32b` - 65,536 context, 30 req/min, 900 req/hour, 14,400 req/day
- `zai-glm-4.6` - 64,000 context, 10 req/min, 100 req/hour, 100 req/day

### Quota Protection

The CLI automatically tracks and enforces quota limits:
- **Request quotas**: Limits on number of API calls per minute/hour/day
- **Token quotas**: Limits on total tokens used per minute/hour/day
- **Context length**: Validates requests don't exceed model's max context length

If a request would exceed limits, the CLI will show an error message indicating which limit was reached and suggest waiting or reducing request size.

### Examples

```bash
# Use a specific model via CLI flag
ccode --model llama-3.3-70b -p "explain async/await"

# Set default model via environment variable
export CEREBRAS_MODEL=gpt-oss-120b
ccode -p "review my code"

# Switch models in REPL
ccode
> /switch-model
# Interactive prompt to select model
```

### Model Policy
The CLI defaults to `qwen-3-235b-a22b-instruct-2507` but supports runtime model selection. All models have quota tracking enabled to prevent exceeding API limits.

## Development
```bash
git clone <repo>
cd cerebras-code-cli
npm install
npm run build
npm link  # optional for local global install
```

Key scripts:
- `npm run dev` – run the CLI in watch mode via `tsx`.
- `npm run test` – smoke test the prompt mode.
- `npm run clean` – remove the `lib/` build output.
- `npm run build` – compile TypeScript to `lib/`.

For local iterations, keep `NODE_ENV=debug` (default) to view detailed logs for config, requests, and errors.

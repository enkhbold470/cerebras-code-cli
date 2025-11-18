# Cerebras Code CLI

Claude Code-style AI coding assistant powered by ultra-fast Cerebras inference. Build, inspect, and edit codebases directly from your terminal with lightning-fast responses (up to 2600 tokens/sec) and full project awareness.

## Features
- **Lightning Fast** – built on Cerebras inference for streaming up to 2600 tokens/sec.
- **Global CLI** – install once with `npm install -g @enkhbold470/cerebras-cli`, access from anywhere.
- **Interactive REPL** – persistent chat session with history, help, and file operations.
- **File Operations** – request reads/writes via natural language; agent uses `Read file:` / `Write file:` instructions.
- **Project Context** – auto-loads `.cerebrasrc` and `CLAUDE.md`, scans structure with glob/fast-glob.
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

## Configuration
Environment variables (via `.env` or shell):
```bash
CEREBRAS_API_KEY=your-api-key
CEREBRAS_MAX_TOKENS=4096
CEREBRAS_TEMPERATURE=0.7
```

Project-level `.cerebrasrc`:
```json
{
  "excludedPaths": ["*.test.ts", "coverage/**", "docs/**"],
  "allowedPaths": ["src/**", "lib/**"]
}
```

Additional instructions can live in `CLAUDE.md`; they automatically seed the system prompt.

## Model Policy
The CLI is pinned to the Cerebras-served model `qwen-3-235b-a22b-instruct-2507` for every request to guarantee consistent behavior and latency. CLI flags and project configs no longer switch models; if you need a different backend, fork the repo and adjust `DEFAULT_MODEL` in `src/config.ts`.

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

# 04 — Usage Workflows

This step-by-step guide shows how to run, test, and operate the Cerebras Code CLI.

## 1. Build and link locally
```bash
npm install          # install dependencies
npm run build        # compile TypeScript to lib/
npm link             # optional: expose global bins cerebras-code / ccode
```

## 2. Prepare environment variables
```bash
export CEREBRAS_API_KEY="your-api-key"
export NODE_ENV=debug        # default; keeps verbose logs
# Optional tuning
export CEREBRAS_MAX_TOKENS=4096
export CEREBRAS_TEMPERATURE=0.7
```

Store persistent secrets in `.env` (gitignored) if preferred:
```
CEREBRAS_API_KEY=...
CEREBRAS_MAX_TOKENS=4096
CEREBRAS_TEMPERATURE=0.7
```

## 3. Run the CLI
- Interactive REPL:
  ```bash
  cerebras-code
  # or
  ccode
  ```
- Single prompt mode:
  ```bash
  ccode -p "explain async/await"
  ccode --system "You are a security auditor" -p "review src/index.ts"
  ```
- Project insights:
  ```bash
  ccode --list-files
  ccode --structure
  ```

## 4. Stream output & file operations
- Responses stream live thanks to the `--stream` default. Use `--no-stream` to disable.
- When the assistant wants file access, it emits:
  ```
  Read file: path/to/file
  Write file: path/to/file
  <content>
  ```
  The REPL’s post-processing step invokes `FileManager` to fulfill these requests and prints success/failure messages.

## 5. Testing checklist
- `npm run build` — required before any commit/PR.
- `npm test` — smoke tests the prompt path (`tsx src/index.ts -p 'test prompt'`). Requires `CEREBRAS_API_KEY`; consider stubbing when adding automated tests.

## 6. Troubleshooting quick hits
- Missing API key → `Error: CEREBRAS_API_KEY not found`. Set the env var and retry.
- Permission issues on the bin → `chmod +x bin/cerebras-code.js`.
- Need a clean slate → `npm run clean && npm run build`.

Extend this file with additional workflows (publishing, CI scripts, advanced piping examples) so every operational step lives in Markdown as requested.

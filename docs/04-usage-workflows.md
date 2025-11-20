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

## 4. Stream output & tool calls
- Responses stream live thanks to the `--stream` default. Use `--no-stream` to disable.
- Tool requests always arrive as JSON blobs (e.g., `{"tool_calls":[{"name":"read_file","input":{"path":"src/index.ts"}}]}`) so the CLI can fulfill them deterministically.
- Tool results (file contents, directory listings, bash output) feed straight back into the agent loop and are cited in the final summary.
- `write_file` responses render git-style `diff` blocks so you can see additions (`+`) and removals (`-`) immediately after each edit.

## 5. Slash commands & approvals
- `/init` scaffold `AGENTS.md` with Codex instructions.
- `/status` show current model (fixed), reasoning mode, approvals, mentions, and tool usage stats.
- `/approvals` choose which tool categories (`write_file`, `run_bash`) are auto-approved vs. require confirmation.
- `/model` adjust reasoning style (fast/balanced/thorough). This updates the system prompt even though the model itself stays pinned.
- `/mention <path>` prioritize files/directories (use `/mention clear` to reset).
- `/compact` summarize recent turns and prune history to avoid context bloat.
- `/quit` exits and prints the Claude Code-style session summary (wall time, API time, code changes, tool counts). The same summary appears on `Ctrl+C`.

## 6. Testing checklist
- `npm run build` — required before any commit/PR.
- `npm test` — smoke tests the prompt path (`tsx src/index.ts -p 'test prompt'`). Requires `CEREBRAS_API_KEY`; consider stubbing when adding automated tests.

## 7. Troubleshooting quick hits
- Missing API key → `Error: CEREBRAS_API_KEY not found`. Set the env var and retry.
- Permission issues on the bin → `chmod +x bin/cerebras-code.js`.
- Need a clean slate → `npm run clean && npm run build`.

Extend this file with additional workflows (publishing, CI scripts, advanced piping examples) so every operational step lives in Markdown as requested.

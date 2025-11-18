# 02 — CLI Architecture

This step documents the core modules that make up the Cerebras Code CLI and how they interact.

## Module map
- `src/index.ts`
  - Parses CLI flags with Commander.
  - Loads environment/project configs.
  - Routes execution to prompt mode, REPL mode, or project-inspection helpers.
  - Forces `NODE_ENV=debug` by default to surface verbose logs during development.
- `src/repl.ts`
  - Manages the interactive session (prompt loop, history, help commands).
  - Streams assistant responses and looks for structured `Read file:`/`Write file:` instructions to turn into filesystem actions.
- `src/cerebras-client.ts`
  - Wraps Cerebras REST endpoints.
  - Supports both single-response and streamed completions, including incremental JSON parsing.
  - Honors `NODE_ENV=debug` by logging request metadata (API key is redacted).
- `src/file-manager.ts`
  - Provides `readFile`, `writeFile`, `listFiles`, and `getProjectStructure` utilities with `glob`/`fast-glob` for speed.
  - Applies default exclude patterns (`node_modules`, `.git`, build folders, logs) and extends them with `.cerebrasrc` overrides.
- `src/config.ts`
  - Loads `.cerebrasrc` plus optional `CLAUDE.md` instructions.
  - Reads `.env` variables via `dotenv`.
  - Exposes `getCerebrasConfig()` with the baked-in model constant.
- `src/types.ts`
  - Houses shared TypeScript interfaces (`Message`, `ProjectConfig`, `StreamChunk`, etc.) for consistent typing across modules.

## Control flow overview
1. CLI starts (`src/index.ts`), loads configs, instantiates `CerebrasClient` and `FileManager`.
2. User selects a mode:
   - `--prompt`: sends a single prompt, optionally streamed.
   - Default: launches REPL with system prompt from `.cerebrasrc`, `CLAUDE.md`, or CLI override.
   - `--list-files` / `--structure`: uses `FileManager` helpers to inspect the workspace.
3. REPL receives user input, appends to conversation history, and calls `CerebrasClient.chat(messages, stream=true)`.
4. Streaming output is written directly to stdout; once complete, `handleFileOperations()` inspects the assistant response for read/write instructions and delegates to `FileManager`.

Future architectural changes (e.g., adding planners or multi-agent flows) should extend this document with new sections so every evolution stays traceable.

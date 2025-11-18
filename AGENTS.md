# Repository Guidelines

## Project Structure & Module Organization
Everything lives in `src/`: `index.ts` wires Commander options, `repl.ts` drives the CLI UX, `agent/` hosts the Claude Code-style loop + system prompt logic, `tools/` defines/executes tool calls, `cerebras-client.ts` hits the Cerebras API, and `file-manager.ts` handles project IO. Builds land in `lib/` via `tsc`, while the executable shim is `bin/cerebras-code.js`. Mirror filenames between source and future tests to keep navigation obvious.

## Build, Test, and Development Commands
- `npm run build` – compile TypeScript to `lib/`.
- `npm run dev` – run the CLI through `tsx src/index.ts` with hot reload.
- `npm run clean` – delete `lib/` so the next build starts fresh.
- `npm test` – smoke-test prompt mode (`tsx src/index.ts -p "test prompt"`); requires `CEREBRAS_API_KEY`.
Use `npm link` for local global installs when dogfooding (`cerebras-code` / `ccode`).

## Coding Style & Naming Conventions
We use strict TypeScript with ES2022 targets. Stick to 2-space indentation, `snake_case` for variables/functions, and `PascalCase` for classes/types. Type every new function, keep side-effects isolated, and reuse interfaces from `src/types.ts`. Formatting is handled by `tsc` + IDE settings; `npm run build` must pass before committing. Leave `NODE_ENV=debug` while developing so verbose logs stay available.

## Testing Guidelines
Add tests with your preferred runner (Vitest or Jest) under `tests/`, mirroring the production path (`tests/agent/loop.test.ts` for `src/agent/loop.ts`). Name cases `should_<behavior>` and target ≥85% coverage on core modules. Because runtime execution hits the live Cerebras API, stub network calls through dependency injection or a mock client. Gate PRs on whatever suite you touch and document fixtures in `tests/README.md`.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat: add repl streaming`, `fix: guard missing api key`) so changelog generation stays easy. Each commit must compile via `npm run build` and mention any REPL/streaming changes. PRs need a short summary, CLI transcript or screenshot for UX tweaks, linked issues, and a checklist covering build/test/docs. Request at least one reviewer for the touched module and add follow-up commits instead of force-pushing after reviews.

## Security & Configuration Tips
Keep API credentials outside version control—use `.env` (already gitignored) or shell exports, never commit `CEREBRAS_API_KEY`. Document new env requirements in `README.md`. When expanding file-system features, honor `.cerebrasrc` `allowedPaths`/`excludedPaths` and sanitize user-provided names. Never bypass the `run_bash` allowlist or modify the JSON-only tool-call protocol that protects the agent loop. The CLI is pinned to `qwen-3-235b-a22b-instruct-2507` (see `src/config.ts`); avoid reintroducing runtime model switching. Run `npm run clean && npm run build` before publishing so no stray artifacts hit npm, and add a secrets scan if you script releases.

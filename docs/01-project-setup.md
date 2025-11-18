# 01 — Project Setup

This document records every step taken to scaffold the Cerebras Code CLI repository.

## 1. Initialize the workspace
- `npm init -y` — bootstrapped `package.json` and converted it to the scoped package `@enkhbold470/cerebras-cli`.
- `git init` — prepared the repository for version control (no commits yet).
- `mkdir -p src bin` — created the source and binary entry directories.
- Added `.gitignore` and `.npmignore` to keep build artifacts (`lib/`, `node_modules/`, `.env*`, etc.) out of Git and npm.

## 2. Install dependencies
- Production: `commander`, `inquirer`, `chalk`, `ora`, `dotenv`, `glob`, `fast-glob`.
- Tooling: `typescript`, `@types/node`, `@types/inquirer`, `tsx`, `del-cli`.
- Documented installs run with elevated permissions because network access is restricted in the environment.

## 3. Configure TypeScript & build tools
- `tsconfig.json` targets `ES2022` with `NodeNext` modules, emitting declarations and source maps to `lib/`.
- `package.json` scripts:
  - `build`: `tsc`
  - `dev`: `tsx src/index.ts`
  - `clean`: `del-cli lib`
  - `prepack`: clean + build
  - `test`: `tsx src/index.ts -p 'test prompt'`

## 4. Provide the CLI entry point
- `bin/cerebras-code.js` is a tiny shim (`#!/usr/bin/env node`) importing the compiled `lib/index.js`.
- Added execute permissions via `chmod +x bin/cerebras-code.js`.
- Declared two binaries in `package.json`: `cerebras-code` and `ccode`.

## 5. Create contributor-facing docs
- `README.md` describes features, installation, configuration, and workflows.
- `AGENTS.md` (Repository Guidelines) outlines structure, coding standards, testing expectations, and security tips.

Re-run `npm run build` after any configuration change to confirm the TypeScript pipeline stays healthy. Document future setup adjustments here as new bullet points or subsections.

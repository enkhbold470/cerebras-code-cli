# Documentation Index

This directory captures every major step involved in building and operating the Cerebras Code CLI. Each Markdown file documents a distinct slice of the work so contributors can trace decisions and reproduce the setup end to end.

- [`01-project-setup.md`](01-project-setup.md) — repository initialization, dependency installation, and TypeScript tooling.
- [`02-cli-architecture.md`](02-cli-architecture.md) — detailed breakdown of each source module, how they collaborate, and key design decisions.
- [`03-model-policy.md`](03-model-policy.md) — rationale for pinning the assistant to `qwen-3-235b-a22b-instruct-2507`, plus configuration guidance.
- [`04-usage-workflows.md`](04-usage-workflows.md) — practical usage steps covering build/test, REPL usage, prompt mode, and project-analysis commands.
- [`05-repl-command-listing.md`](05-repl-command-listing.md) — REPL startup enhancement that displays all available commands with descriptions.
- [`06-realtime-slash-command-feedback.md`](06-realtime-slash-command-feedback.md) — real-time visual feedback (spinners) for slash command execution.
- [`07-non-blocking-slash-commands.md`](07-non-blocking-slash-commands.md) — non-blocking, concurrent slash command execution using readline.

Add new numbered files when you introduce additional phases (e.g., testing strategy, release automation) so the entire lifecycle stays documented.

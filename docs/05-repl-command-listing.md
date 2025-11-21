# 05 — REPL Command Listing Enhancement

This document describes the enhancement to the REPL startup experience that displays all available commands when the agent first runs.

## Overview

Previously, the REPL displayed a brief, single-line summary of available commands that was easy to miss. The enhancement improves discoverability by showing a formatted, comprehensive list of all built-in and custom commands with their descriptions when the REPL starts.

## Changes Made

### File Modified
- `src/repl.ts` — Enhanced the `start()` method to display a formatted command list

### Implementation Details

**Before:**
The REPL showed a compact, single-line command summary:
```
Commands: /init, /status, /approvals, /model, /mention <path>, /compact, /quit. Type "help" for tips.
```

**After:**
The REPL now displays a formatted, multi-line command list with descriptions organized by category:

```
Available Commands:

  Slash Commands:
    /init                 scaffold AGENTS.md with Codex instructions
    /status               show current model, reasoning mode, approvals, mentions, and tool usage counts
    /approvals            choose which tool categories (write_file, run_bash) are auto-approved
    /model                switch reasoning style (fast, balanced, thorough)
    /mention <path>        highlight files/directories the agent must focus on (/mention clear resets)
    /compact              summarize recent turns and trim context to avoid token pressure
    /quit                 exit and display the session summary

  Text Commands:
    help                  show help information and tips
    clear                 clear conversation history and reset system prompt
    exit                  exit the REPL (same as /quit)

  Custom Slash Commands:
    /custom-command       Custom command description (if any exist)

Type "help" for more tips or start chatting with the agent.
```

### Key Features

1. **Slash Commands Section**
   - Lists all 7 built-in slash commands with their descriptions
   - Command names are color-coded in green for visibility
   - Descriptions are in gray for readability
   - Proper alignment using `padEnd()` for consistent formatting

2. **Text Commands Section**
   - Lists all 3 non-slash text commands (`help`, `clear`, `exit`)
   - These commands don't require a leading slash
   - Provides alternative ways to interact with the REPL

3. **Custom Commands Section**
   - Dynamically loads custom commands from `~/.cerebras/commands/`
   - Only displays if custom commands exist
   - Shows command name and description from frontmatter metadata

3. **Improved UX**
   - Clear section headers with yellow bold text
   - Better visual hierarchy
   - More informative than the previous single-line format
   - Helps users discover available commands immediately

### Code Changes

The implementation:
- Loads custom commands via `CommandRegistry` before displaying
- Defines built-in commands as an array of objects with `name` and `desc` properties
- Uses `chalk` for color-coded output (green for commands, gray for descriptions, yellow for headers)
- Formats output with proper spacing and alignment
- Maintains backward compatibility with existing functionality

## Benefits

1. **Better Discoverability** — Users immediately see all available commands when starting the REPL
2. **Complete Command Coverage** — Shows both slash commands (`/init`, `/status`, etc.) and text commands (`help`, `clear`, `exit`)
3. **Clear Documentation** — Each command includes a description matching the README.md documentation
4. **Organized Display** — Commands are grouped by type (Slash Commands, Text Commands, Custom Commands) for better readability
5. **Custom Command Support** — Custom commands are automatically included in the listing
6. **Professional Appearance** — Formatted, color-coded output improves the CLI experience

## Commands Included

### Slash Commands (7 total)
- `/init` — scaffold AGENTS.md
- `/status` — show session status
- `/approvals` — configure auto-approvals
- `/model` — switch reasoning style
- `/mention <path>` — highlight files/directories
- `/compact` — summarize and trim context
- `/quit` — exit with summary

### Text Commands (3 total)
- `help` — show help information
- `clear` — clear conversation history
- `exit` — exit the REPL

### Custom Commands
- Dynamically loaded from `~/.cerebras/commands/*.md`
- Displayed only if custom commands exist

**Note:** Tools (like `read_file`, `write_file`, `list_directory`, `search_text`, `run_bash`, and verification tools) are internal agent capabilities and are used automatically when chatting with the agent. They are not displayed as user commands since they're invoked by the agent, not directly by users.

## Testing

The changes were verified by:
- Building the project successfully (`npm run build`)
- Checking for lint errors (none found)
- Ensuring the command registry integration works correctly

## Related Documentation

- [`04-usage-workflows.md`](04-usage-workflows.md) — Documents slash command usage
- [`README.md`](../README.md) — Main documentation with command descriptions
- [`example-slash-command.md`](example-slash-command.md) — Guide for creating custom commands

## Future Enhancements

Potential improvements:
- Add command aliases display
- Show command usage examples
- Add keyboard shortcuts if implemented
- Display MCP server tools if MCP integration is expanded


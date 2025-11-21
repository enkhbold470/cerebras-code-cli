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
The REPL now displays a formatted, multi-line command list with descriptions:

```
Available Commands:

  /init                 scaffold AGENTS.md with Codex instructions
  /status               show current model, reasoning mode, approvals, mentions, and tool usage counts
  /approvals            choose which tool categories (write_file, run_bash) are auto-approved
  /model                switch reasoning style (fast, balanced, thorough)
  /mention <path>        highlight files/directories the agent must focus on (/mention clear resets)
  /compact              summarize recent turns and trim context to avoid token pressure
  /quit                 exit and display the session summary

Custom Commands:
  /custom-command       Custom command description (if any exist)

Type "help" for more tips or start chatting with the agent.
```

### Key Features

1. **Built-in Commands Section**
   - Lists all 7 built-in slash commands with their descriptions
   - Command names are color-coded in green for visibility
   - Descriptions are in gray for readability
   - Proper alignment using `padEnd()` for consistent formatting

2. **Custom Commands Section**
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
2. **Clear Documentation** — Each command includes a description matching the README.md documentation
3. **Custom Command Support** — Custom commands are automatically included in the listing
4. **Professional Appearance** — Formatted, color-coded output improves the CLI experience

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


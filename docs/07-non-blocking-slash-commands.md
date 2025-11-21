# 07 — Non-Blocking Slash Command Execution

This document describes the enhancement that enables non-blocking, concurrent execution of slash commands, allowing users to issue commands while other operations are in progress.

## Overview

Previously, the REPL used `inquirer.prompt()` which blocked the input loop, preventing users from issuing new commands while previous commands were executing. The enhancement replaces the blocking input mechanism with `readline` for event-driven, non-blocking input, enabling real-time interleaving of commands.

## Problem Statement

**Before:**
- Commands executed synchronously, blocking the input loop
- Users had to wait for one command to complete before issuing another
- No way to check status or issue quick commands during long-running operations
- Poor UX when commands take time (e.g., agent processing, file operations)

**After:**
- Commands execute asynchronously without blocking input
- Users can issue multiple commands in quick succession
- Commands are queued and execute independently
- Real-time feedback shows command status
- Input remains responsive during command execution

## Changes Made

### File Modified
- `src/repl.ts` — Replaced blocking `inquirer` input loop with non-blocking `readline` interface

### Implementation Details

**Key Changes:**

1. **Replaced Input Mechanism**
   - **Before:** `inquirer.prompt()` - blocking, waits for Enter
   - **After:** `readline.createInterface()` - event-driven, non-blocking

2. **Async Command Execution**
   - Commands execute in background without blocking input
   - Command queue tracks pending operations
   - Status indicators show command progress

3. **Interactive Prompt Handling**
   - Commands that need `inquirer` prompts (`/approvals`, `/model`) pause `readline` temporarily
   - After prompt completes, `readline` resumes automatically

### Architecture

```
User Input → readline Interface → handleInput()
                                    ↓
                    ┌───────────────┴───────────────┐
                    │                               │
            Slash Command?                    Regular Input?
                    │                               │
                    ↓                               ↓
        executeSlashCommandAsync()      processInputAsync()
                    │                               │
                    └───────────────┬───────────────┘
                                    ↓
                            Non-blocking Execution
                                    ↓
                            Status Updates (spinners)
                                    ↓
                            Prompt Ready for Next Input
```

### Code Structure

**Main Input Loop:**
```typescript
this.rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.green('> '),
});

this.rl.on('line', async (input: string) => {
  await this.handleInput(input);
});
```

**Async Command Execution:**
```typescript
private async executeSlashCommandAsync(raw: string): Promise<void> {
  const commandId = `${Date.now()}-${Math.random()}`;
  this.pendingCommands.add(commandId);
  
  try {
    await this.handleSlashCommand(raw);
  } finally {
    this.pendingCommands.delete(commandId);
    this.rl!.prompt(); // Ready for next input
  }
}
```

**Interactive Prompt Handling:**
```typescript
case 'approvals': {
  this.rl!.pause();  // Pause readline
  await this.configureApprovals(false);
  this.rl!.resume(); // Resume readline
  return false;
}
```

## Benefits

1. **Non-Blocking Execution** — Commands don't block the input loop
2. **Concurrent Commands** — Multiple commands can be queued and execute independently
3. **Better UX** — Users can issue quick commands (like `/status`) during long operations
4. **Real-Time Feedback** — Spinners show command progress without blocking input
5. **Responsive Interface** — Input remains available even during command execution

## Command Execution Flow

1. User types command and presses Enter
2. Input is immediately processed and command queued
3. Command executes asynchronously with spinner feedback
4. Input prompt returns immediately, ready for next command
5. Command completion updates status (success/failure)
6. Next command can be issued without waiting

## Technical Details

### Dependencies
- `readline` — Node.js built-in module for non-blocking input
- `inquirer` — Still used for interactive prompts (pauses readline temporarily)
- `ora` — Spinners for command status feedback

### State Management
- `pendingCommands: Set<string>` — Tracks active commands
- `isProcessing: boolean` — Tracks agent processing state
- `rl: readline.Interface` — Main input interface

### Error Handling
- Commands catch errors and display them without crashing
- Failed commands don't block subsequent commands
- Error messages are clearly displayed with context

## Limitations & Considerations

1. **Agent Processing** — Only one agent request processes at a time (prevents context conflicts)
2. **Interactive Prompts** — Commands with prompts (`/approvals`, `/model`) temporarily pause input
3. **Output Interleaving** — Multiple command outputs may interleave (by design for responsiveness)

## Related Documentation

- [`06-realtime-slash-command-feedback.md`](06-realtime-slash-command-feedback.md) — Spinner feedback for commands
- [`05-repl-command-listing.md`](05-repl-command-listing.md) — Command listing enhancement
- [`04-usage-workflows.md`](04-usage-workflows.md) — Usage workflows

## Future Enhancements

Potential improvements:
- Command history navigation (up/down arrows)
- Tab completion for slash commands
- Command cancellation (Ctrl+C during execution)
- Parallel agent requests with context isolation
- Command output buffering to prevent interleaving

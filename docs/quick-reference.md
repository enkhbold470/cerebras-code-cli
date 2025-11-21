# Quick Reference Guide

Quick reference for all Claude Code features implemented in Cerebras Code CLI.

## Features Overview

| Feature | Location | Status | Tests |
|---------|----------|--------|-------|
| ReAct Loop | `src/agent/system-prompt.ts` | ✅ Complete | 15 tests |
| Context Loading | `src/config/context-loader.ts` | ✅ Complete | 10 tests |
| Slash Commands | `src/commands/` | ✅ Complete | 11 tests |
| Verification Tools | `src/tools/definitions.ts` | ✅ Complete | 11 tests |
| YOLO Mode | `src/session/state.ts` | ✅ Complete | 16 tests |
| MCP Support | `src/mcp/client.ts` | 🔄 Framework | 6 tests |
| Orchestration | `src/agent/orchestrator.ts` | ✅ Complete | 6 tests |

## Quick Commands

### Context Files
```bash
# Global (all projects)
~/.cerebras/AGENTS.md
~/.cerebras/CLAUDE.md

# Project
./AGENTS.md
./CLAUDE.md

# Directory
./src/AGENTS.md
```

### Slash Commands
```bash
# Create command
~/.cerebras/commands/my-command.md

# Use in REPL
> /my-command arg1 arg2
```

### YOLO Mode
```bash
ccode --yolo -p "fix lint errors"
ccode --dangerously-skip-permissions -p "generate tests"
```

### Verification Tools
```json
{"tool_calls": [{"name": "verify_type_check", "input": {"path": "src/index.ts"}}]}
{"tool_calls": [{"name": "verify_lint", "input": {"path": "src/index.ts", "fix": true}}]}
{"tool_calls": [{"name": "verify_format", "input": {"path": "src/index.ts"}}]}
{"tool_calls": [{"name": "verify_test", "input": {"path": "src/index.test.ts"}}]}
```

## File Structure

```
src/
├── agent/
│   ├── loop.ts              # Agent loop (existing)
│   ├── parser.ts             # Response parser (existing)
│   ├── system-prompt.ts      # ✨ Enhanced system prompt
│   └── orchestrator.ts       # ✨ Multi-agent orchestration
├── commands/
│   ├── slash-commands.ts     # ✨ Command loader
│   └── registry.ts           # ✨ Command registry
├── config/
│   └── context-loader.ts    # ✨ Hierarchical context loading
├── mcp/
│   └── client.ts             # ✨ MCP client framework
├── session/
│   └── state.ts              # ✨ Enhanced with permission modes
└── tools/
    └── definitions.ts        # ✨ Added verification tools
```

## Configuration Examples

### AGENTS.md Template
```markdown
## Project Overview
Brief description.

## Tech Stack
- Language: TypeScript
- Framework: Next.js

## Do's ✅
- Use TypeScript strict mode
- Follow existing patterns

## Don'ts ❌
- Don't use `any` type
```

### Slash Command Template
```markdown
---
allowed-tools: 
  - Edit
  - Bash(npm:*)
hints: Command description
---
# Command Name
Command content with $ARGUMENTS
```

### MCP Configuration
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {}
    }
  }
}
```

## Permission Modes

| Mode | Flag | Behavior |
|------|------|----------|
| Interactive | (default) | Ask for approval |
| Auto-Accept | `-p` prompt | Auto-approve in prompt mode |
| YOLO | `--yolo` | Auto-approve all operations |

## Test Commands

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With UI
npm run test:ui

# Coverage
npm run test:coverage
```

## Key Classes & Methods

### ContextLoader
```typescript
const loader = new ContextLoader(projectRoot, currentDir);
const files = await loader.loadContextFiles();
const merged = await loader.mergeContext();
const stats = await loader.getContextStats();
```

### SlashCommandLoader
```typescript
const loader = new SlashCommandLoader(commandsDir);
const commands = await loader.loadCommands();
const result = await loader.executeCommand(command, args, context);
```

### CommandRegistry
```typescript
const registry = new CommandRegistry(loader);
await registry.load();
const command = registry.get('name');
const names = registry.getNames();
```

### SessionState
```typescript
sessionState.setPermissionMode('yolo');
sessionState.setApprovals({ write_file: true });
sessionState.addMention('src/index.ts');
```

### AgentOrchestrator
```typescript
const orchestrator = new AgentOrchestrator(...);
orchestrator.registerSubagent(config);
const plan = await orchestrator.createPlan(request);
const result = await orchestrator.executePlan(plan);
```

## Common Patterns

### Creating a Slash Command
1. Create `~/.cerebras/commands/my-command.md`
2. Add frontmatter with metadata
3. Write command content
4. Use in REPL: `/my-command args`

### Setting Up Context
1. Create global `~/.cerebras/AGENTS.md` for defaults
2. Create project `./AGENTS.md` for project rules
3. Create directory `./src/AGENTS.md` for overrides

### Using Verification Tools
1. Agent calls `verify_type_check` after code changes
2. Agent calls `verify_lint` with `fix: true`
3. Agent calls `verify_format` to format code
4. Agent calls `verify_test` to run tests

### Multi-Agent Workflow
1. Register specialist subagents
2. Create orchestration plan
3. Execute tasks in dependency order
4. Collect and summarize results

## Troubleshooting

### Context Not Loading
- Check file paths (global → project → directory)
- Verify file names (`AGENTS.md` or `CLAUDE.md`)
- Check file permissions

### Slash Commands Not Found
- Verify `~/.cerebras/commands/` exists
- Check file extension (`.md`)
- Verify frontmatter syntax

### YOLO Mode Not Working
- Use `--yolo` or `--dangerously-skip-permissions` flag
- Check session state permission mode
- Verify auto-approval settings

### Tests Failing
- Run `npm install` to ensure dependencies
- Check test file paths
- Verify mock setup

## Documentation Files

- `docs/implementation-summary.md` - Complete change summary
- `docs/CHANGELOG.md` - Detailed changelog
- `docs/claude-code-features.md` - Feature details
- `docs/example-agents.md` - AGENTS.md template
- `docs/example-slash-command.md` - Command example
- `tests/README.md` - Test documentation

## Support

For issues or questions:
1. Check `docs/implementation-summary.md` for details
2. Review `docs/claude-code-features.md` for feature docs
3. See `tests/README.md` for test examples
4. Check `README.md` for usage examples

# Test Suite Documentation

This directory contains comprehensive unit tests for all Claude Code-style features implemented in the Cerebras Code CLI.

## Test Coverage

### ✅ All Tests Passing (75 tests across 7 test files)

#### 1. ContextLoader Tests (`tests/config/context-loader.test.ts`) - 10 tests
- ✅ Loads no files when none exist
- ✅ Loads global AGENTS.md
- ✅ Loads project-level AGENTS.md and CLAUDE.md
- ✅ Loads directory-specific context files
- ✅ Handles missing files gracefully
- ✅ Merges multiple context files
- ✅ Prioritizes deeper files over higher ones
- ✅ Returns empty string when no files exist
- ✅ Returns stats for loaded context files
- ✅ Returns zero stats when no files exist

#### 2. SlashCommandLoader & CommandRegistry Tests (`tests/commands/slash-commands.test.ts`) - 11 tests
- ✅ Returns empty map when commands directory does not exist
- ✅ Loads command from markdown file
- ✅ Parses frontmatter metadata (YAML arrays supported)
- ✅ Handles nested command files
- ✅ Ignores non-markdown files
- ✅ Replaces $ARGUMENTS placeholder
- ✅ Replaces $PROJECT_ROOT and $CURRENT_DIR
- ✅ Loads and registers commands
- ✅ Gets command by name
- ✅ Lists all commands
- ✅ Returns command names

#### 3. SessionState Tests (`tests/session/state.test.ts`) - 16 tests
- ✅ Defaults to interactive mode
- ✅ Sets permission mode to auto-accept
- ✅ Sets permission mode to yolo and auto-approves all
- ✅ Does not auto-approve in interactive mode
- ✅ Sets individual approval
- ✅ Sets multiple approvals
- ✅ Provides approvals summary
- ✅ Defaults to balanced reasoning
- ✅ Sets reasoning mode
- ✅ Provides reasoning description
- ✅ Adds mention
- ✅ Adds multiple mentions
- ✅ Clears mentions
- ✅ Ignores empty mentions
- ✅ Returns model name
- ✅ Stores custom system instruction

#### 4. System Prompt Builder Tests (`tests/agent/system-prompt.test.ts`) - 15 tests
- ✅ Includes role and identity section
- ✅ Includes core capabilities
- ✅ Includes ReAct loop pattern
- ✅ Includes response format
- ✅ Includes tool usage guidelines
- ✅ Includes safety and permissions
- ✅ Includes code quality standards
- ✅ Includes self-verification protocol
- ✅ Includes available tools
- ✅ Includes project instructions when provided
- ✅ Includes reasoning preference
- ✅ Includes approval policy
- ✅ Includes focus files when mentioned
- ✅ Includes custom system instruction
- ✅ Filters out empty sections

#### 5. Verification Tools Tests (`tests/tools/verification.test.ts`) - 11 tests
- ✅ Returns success when type check passes
- ✅ Returns errors when type check fails
- ✅ Checks entire project when path not provided
- ✅ Auto-fixes lint by default
- ✅ Does not fix when fix is false
- ✅ Returns success when lint passes
- ✅ Formats by default
- ✅ Only checks when check is true
- ✅ Runs tests for specific file
- ✅ Runs all tests when path not provided
- ✅ Handles test failures

#### 6. AgentOrchestrator Tests (`tests/agent/orchestrator.test.ts`) - 6 tests
- ✅ Registers a subagent
- ✅ Creates a plan from user request
- ✅ Creates fallback plan when JSON parsing fails
- ✅ Executes tasks in dependency order
- ✅ Executes independent tasks in parallel order
- ✅ Throws error on circular dependencies

#### 7. MCPClient Tests (`tests/mcp/client.test.ts`) - 6 tests
- ✅ Returns null when config file does not exist
- ✅ Loads valid MCP server configuration
- ✅ Returns null for invalid JSON
- ✅ Returns empty array (placeholder)
- ✅ Throws error (not yet implemented)
- ✅ Shuts down without errors

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Structure

Each test file follows this pattern:
1. **Setup** - Create test fixtures and mocks
2. **Tests** - Grouped by feature/functionality
3. **Cleanup** - Remove test artifacts

## Mocking Strategy

- **File System**: Uses temporary directories created in `/tmp`
- **Child Process**: Mocks `exec` for verification tools
- **Agent Loop**: Mocks `run` method for orchestrator tests

## Key Testing Patterns

### 1. Temporary Directories
```typescript
beforeEach(async () => {
  testDir = join(tmpdir(), `cerebras-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  if (existsSync(testDir)) {
    await rm(testDir, { recursive: true, force: true });
  }
});
```

### 2. Mocking Child Process
```typescript
vi.mocked(exec).mockImplementation((command, options, callback) => {
  callback?.(null, { stdout: '', stderr: '' });
  return {} as any;
});
```

### 3. Testing Async Operations
```typescript
it('should load commands', async () => {
  await writeFile(join(commandsDir, 'test.md'), '# Test');
  const commands = await loader.loadCommands();
  expect(commands.size).toBe(1);
});
```

## Coverage Goals

- **Unit Tests**: 100% coverage of new features
- **Integration Tests**: Core workflows tested
- **Edge Cases**: Error handling and boundary conditions

## Future Test Additions

- [ ] Integration tests for full agent loop
- [ ] E2E tests for REPL interactions
- [ ] Performance tests for context loading
- [ ] Security tests for permission modes

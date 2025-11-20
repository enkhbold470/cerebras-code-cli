Based on my deep research on building CLI developer tools like Claude Code, Gemini CLI, and Codex CLI, here's a comprehensive guide with the best practices, system prompts, rules.md patterns, and implementation details:

# Building Agentic CLI Developer Tools: Complete Technical Guide

## 🎯 Core Architecture Patterns

### 1. **ReAct Loop (Reasoning + Acting)**
The foundation of all modern agentic CLI tools:

```
THOUGHT → ACTION → OBSERVATION → THOUGHT → ...
```

**Implementation Pattern:**
```python
# Core Agent Loop Structure
while not task_complete:
    # 1. THOUGHT: Reasoning phase
    thought = llm.generate(
        context=conversation_history + tool_docs + project_context,
        prompt="What should I do next to accomplish this task?"
    )
    
    # 2. ACTION: Tool selection and execution
    if thought.contains_tool_call():
        tool_name = extract_tool_name(thought)
        tool_args = extract_args(thought)
        result = execute_tool(tool_name, tool_args)
        
        # 3. OBSERVATION: Process result
        conversation_history.append({
            "role": "assistant",
            "thought": thought,
            "action": tool_name,
            "action_input": tool_args
        })
        conversation_history.append({
            "role": "tool",
            "observation": result
        })
    else:
        task_complete = True
```

### 2. **Client-Host-Server Architecture (MCP)**

```
┌─────────────────────────────────────┐
│         HOST (Terminal/IDE)         │
│  ┌─────────────┐  ┌─────────────┐  │
│  │  MCP Client │  │  MCP Client │  │
│  │      1      │  │      2      │  │
│  └──────┬──────┘  └──────┬──────┘  │
└─────────┼─────────────────┼─────────┘
          │                 │
          ▼                 ▼
    ┌─────────┐       ┌─────────┐
    │  MCP    │       │  MCP    │
    │ Server  │       │ Server  │
    │   1     │       │   2     │
    └────┬────┘       └────┬────┘
         │                 │
         ▼                 ▼
    [Database]        [GitHub API]
```

**Key Design Principles:**
- **Isolation**: Each MCP server operates independently
- **Stateful Sessions**: Maintain context across tool calls
- **JSON-RPC 2.0**: Standard protocol for all communication
- **Capability Negotiation**: Declare features at initialization

***

## 📝 System Prompt Engineering

### Master System Prompt Structure

```markdown
# ROLE & IDENTITY
You are an expert coding agent operating in the user's terminal environment.
You understand codebases, execute commands, and help developers code faster.

# CORE CAPABILITIES
You can:
- Edit files and fix bugs across the codebase
- Answer questions about architecture and code logic
- Run tests, linters, and other developer commands
- Execute Git operations (search history, resolve conflicts, create commits/PRs)
- Use bash tools and system commands
- Invoke MCP servers for extended functionality

# BEHAVIORAL RULES

## Reasoning Pattern
Always follow the ReAct loop:
1. THOUGHT: Analyze the situation and decide what to do next
2. ACTION: Select the appropriate tool and provide valid arguments
3. OBSERVATION: Process the result and determine next steps
4. Repeat until task is complete

## Response Format
Structure your responses as:
```
Thought: [Your reasoning about what to do]
Action: [Tool name]
Action Input: {"arg1": "value1", "arg2": "value2"}
```

Wait for Observation, then continue reasoning.

When task is complete, provide Final Answer without Action.

## Tool Usage Guidelines
- ALWAYS use tools - never hallucinate file contents or outputs
- Read files before modifying them
- Run tests after code changes
- Commit related changes together with descriptive messages
- Ask clarifying questions when requirements are ambiguous

## Safety & Permissions
- Ask before destructive operations (rm, chmod, data deletion)
- Validate inputs before executing commands
- Check command outputs for errors before proceeding
- Use file-scoped commands (single file tests/lint) over full builds

## Code Quality Standards
- Follow project conventions defined in CLAUDE.md/AGENTS.md
- Write tests for new functionality
- Run linters and type checkers
- Keep changes minimal and focused
- Prefer small, atomic commits

# AVAILABLE TOOLS
[Tool definitions will be injected here dynamically]

# PROJECT CONTEXT
[CLAUDE.md/AGENTS.md/GEMINI.md content will be loaded here]

# CURRENT TASK
[User's prompt goes here]
```

***

## 🗂️ Configuration File Patterns

### Universal: AGENTS.md (Cross-Tool Standard)

```markdown
# AGENTS.md

## Project Overview
Brief 2-3 sentence description of what this project does.

## Tech Stack
- Language: TypeScript 5.2
- Framework: Next.js 14 (App Router)
- State: Zustand 4.x
- Styling: Tailwind CSS + shadcn/ui
- Testing: Vitest + Playwright
- Database: PostgreSQL with Prisma ORM

## Project Structure
- `app/` - Next.js app router pages and layouts
- `components/` - Reusable UI components (use shadcn/ui patterns)
- `lib/` - Shared utilities and business logic
- `prisma/` - Database schema and migrations
- `tests/` - Unit and integration tests

Key entry points:
- See `app/layout.tsx` for global app structure
- See `lib/api/client.ts` for API interaction patterns
- See `components/ui/` for base design system

## Commands

### File-Scoped (Preferred)
```
# Type check single file
npx tsc --noEmit path/to/file.tsx

# Format single file  
npx prettier --write path/to/file.tsx

# Lint single file
npx eslint --fix path/to/file.tsx

# Run specific test
npx vitest run path/to/file.test.tsx
```

### Project-Wide (Use sparingly)
```
npm run build       # Full production build
npm run test:e2e    # End-to-end test suite
```

## Do's ✅
- Use functional components with hooks (no class components)
- Use TypeScript strict mode - all types must be explicit
- Follow React Server Components patterns for app router
- Use Zod for runtime validation
- Prefer composition over prop drilling
- Keep components under 200 lines
- Co-locate tests with implementation files
- Use design tokens from `lib/theme/tokens.ts`
- Write JSDoc comments for exported functions

## Don'ts ❌
- Don't use `any` type - use `unknown` and narrow
- Don't edit files in `app/legacy/` directory
- Don't install heavy dependencies without approval
- Don't hardcode API endpoints - use environment variables
- Don't bypass authentication checks
- Don't commit directly to `main` branch
- Don't use inline styles - use Tailwind classes
- Don't create new component libraries - use shadcn/ui

## Examples

### Good Component Pattern
```
// components/UserProfile.tsx
interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

export function UserProfile({ userId, onUpdate }: UserProfileProps) {
  // Implementation using hooks, proper types, and composition
}
```

### Good API Pattern  
```
// lib/api/users.ts
import { apiClient } from './client';

export async function fetchUser(id: string): Promise<User> {
  return apiClient.get<User>(`/users/${id}`);
}
```

### Bad Pattern (Avoid)
```
// ❌ Class component
class UserProfile extends React.Component { }

// ❌ Any types
function process(data: any) { }

// ❌ Inline API calls in components
function UserProfile() {
  fetch('/api/users/123').then(...);
}
```

## Testing Guidelines
- Write tests for all new business logic
- Test user interactions, not implementation details
- Mock external APIs using MSW
- Use data-testid for E2E test selectors
- Aim for 80% coverage on core business logic

## Git Workflow
- Branch naming: `feature/description` or `fix/description`
- Commit format: `type(scope): message` (conventional commits)
- PR checklist: tests pass, linter clean, no console.logs
- Squash commits before merging

## API Documentation
See `docs/api/*.md` for endpoint documentation:
- `POST /api/auth/login` - User authentication
- `GET /api/users/:id` - Fetch user profile
- `PATCH /api/users/:id` - Update user data

## When Stuck
- Ask clarifying questions before making assumptions
- Propose a plan with 2-3 options
- Open draft PR with questions in comments
- Reference similar patterns in existing code
```

### Tool-Specific Configurations

**CLAUDE.md** (Claude Code):
```markdown
# CLAUDE.md

Strictly follow the rules in ./AGENTS.md

## Additional Claude-Specific Notes
- Use /initialize to set up project context on first run
- Prefer slash commands for common workflows
- Enable MCP servers in ~/.claude/config.json for extended tools
```

**codex.md** (OpenAI Codex):
```markdown
# codex.md

Follow all guidelines in AGENTS.md

## Codex-Specific Behavior
- Supports persistent memory via codex.md and ~/.codex/instructions.md
- Use --no-project-doc to disable project context if needed
- Supports AGENTS.md for multi-agent collaboration patterns
```

**GEMINI.md** (Gemini CLI):
```markdown
# GEMINI.md

See AGENTS.md for complete project rules.

## Mode-Specific Instructions

### Plan Mode Only
You are in PLAN mode. Do not write code. Instead:
1. Break down the user's request into discrete tasks
2. Identify dependencies between tasks  
3. Suggest implementation order
4. Output structured task list

### Explain Mode
You are an interactive guide helping users understand this codebase.
- Ask clarifying questions to understand their goal
- Explain concepts in increasing levels of detail
- Reference actual code files with line numbers
- Use diagrams when helpful
```

***

## 🔧 Slash Command Implementation

### Command File Structure

**Location**: `~/.claude/commands/tools/generate-tests.md`

```markdown
---
allowed-tools: 
  - Edit
  - Bash(npm:*)
  - Bash(npx:*)
model: claude-sonnet-4
hints: |
  Generate comprehensive test suite for the specified file
---

# Generate Tests Command

You are tasked with generating tests for: $ARGUMENTS

## Process:
1. Read the target file and understand its exports
2. Identify all functions, classes, and edge cases
3. Create test file following project patterns
4. Run tests to verify they pass
5. Report coverage percentage

## Test Structure:
```
import { describe, it, expect } from 'vitest';
import { functionName } from './source-file';

describe('functionName', () => {
  it('should handle happy path', () => {
    // Test implementation
  });
  
  it('should handle edge case', () => {
    // Test implementation
  });
});
```

## Execution Steps:
1. `!cat $ARGUMENTS` - Read source file
2. Create test file at `$ARGUMENTS.test.ts`
3. `!npx vitest run $ARGUMENTS.test.ts` - Run tests
4. Report results and coverage

Begin by reading the file.
```

### Advanced: Dynamic Commands with Bash

```markdown
---
allowed-tools:
  - Edit
  - Bash(*)
---

# Smart Commit Command

## Context Injection
Project root: `!pwd`
Current branch: `!git branch --show-current`
Modified files: `!git diff --name-only`
File count: `!git diff --name-only | wc -l`

## Task
Create a meaningful commit for these changes:

Modified files:
```
!git diff --name-only
```

Diff summary:
```
!git diff --stat
```

## Instructions:
1. Analyze the changes using the diff
2. Generate commit message following conventional commits:
   - format: `type(scope): description`
   - types: feat, fix, docs, refactor, test, chore
3. Keep subject line under 50 chars
4. Add body if needed to explain "why"
5. Execute: `git commit -m "<message>"`

Generate the commit now.
```

***

## 🛡️ Safety & Permission Patterns

### Three Permission Modes

**1. Interactive (Default)**
```bash
claude "Fix the bug in auth.ts"
# Asks permission for each file edit, command execution
```

**2. Auto-Accept (Shift+Tab in UI)**
```bash
# UI-based mode showing actions but not blocking
# User can still see and intervene
```

**3. YOLO Mode (Headless Automation)**
```bash
claude -p "Fix lint errors" \
  --dangerously-skip-permissions \
  --output-format stream-json
```

### Safe YOLO Configuration

**~/.claude/config.json**:
```json
{
  "allowedTools": [
    "Read",
    "List",
    "Bash(ls:*)",
    "Bash(cat:*)",
    "Bash(grep:*)",
    "Bash(git status:*)",
    "Bash(git diff:*)",
    "Bash(npm test:*)",
    "Bash(npx tsc:*)",
    "Bash(npx eslint:*)",
    "Bash(npx prettier:*)",
    "Edit(*)",
    "Update(*)"
  ],
  "deny": [
    "Bash(rm:*)",
    "Bash(chmod:*)",
    "Bash(sudo:*)",
    "Bash(curl:*)",
    "Bash(wget:*)",
    "Bash(docker:*)"
  ]
}
```

### Best Practices for YOLO Mode

```markdown
## Safe Use Cases ✅
- Lint fixes across multiple files
- Test generation for existing code  
- Documentation updates
- Boilerplate code generation
- Git commit message generation
- Dependency updates (with lock files)

## Dangerous Use Cases ❌
- First-time project setup
- Database migrations
- File deletion operations
- System configuration changes
- Production deployments
- Working with sensitive credentials

## Safety Checklist
1. ✓ Working in Git repository with clean branch
2. ✓ Created backup/commit point before YOLO
3. ✓ Scoped to specific directory
4. ✓ AllowedTools whitelist configured
5. ✓ Not touching production systems
6. ✓ Can review output after completion
7. ✓ Have tested on small scope first
```

***

## 🔄 Context Management Strategies

### Hierarchical Context Loading

```
~/.claude/CLAUDE.md           # Global (all projects)
    ↓
project-root/CLAUDE.md        # Project-wide  
    ↓
project-root/src/CLAUDE.md    # Directory-specific
    ↓
actual context used by agent   # Merged hierarchy
```

**Priority**: Deeper files override higher ones

### Context File Size Budget

```markdown
## Token Budget Guidelines

### CLAUDE.md Size Targets
- Global (~/.claude): 50-100 lines max
- Project root: 100-150 lines max  
- Subdirectories: 30-50 lines max

### Why This Matters
- Files are prepended to EVERY request
- Large files = wasted tokens + increased cost
- Context pollution reduces accuracy

### How to Stay Lean
✅ Use bullet points, not paragraphs
✅ Reference external docs with @filepath  
✅ Include only what's needed for EVERY session
✅ Move task-specific info to slash commands

❌ Don't paste entire style guides
❌ Don't include obvious information  
❌ Don't duplicate what's in code comments
```

### Living Document Workflow

```markdown
## Maintaining Project Context

### When to Update
- Agent consistently gets same thing wrong → add rule
- New pattern introduced → document example
- Tool/command added → update commands section
- Convention changed → update do's/don'ts

### Team Workflow
1. Developer encounters pattern mistake during PR review
2. Add note to "AGENTS.md pending updates" section
3. Weekly: team reviews and consolidates updates
4. Test changes with agent before committing

### Version Control
- Commit AGENTS.md/CLAUDE.md changes separately
- Write descriptive commit messages for context changes
- Tag major context refactors
- Use branches for experimental context patterns
```

***

## 🎨 Prompt Engineering Techniques

### 1. **Few-Shot Examples in Context**

```markdown
## Examples of Good Implementations

### Example 1: API Route Handler
```
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = createUserSchema.parse(body);
    const user = await db.user.create({ data });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { errors: error.errors },
        { status: 400 }
      );
    }
    throw error;
  }
}
```

Copy this pattern for all new API routes.
```

### 2. **Chain-of-Thought Prompting**

```markdown
## Problem-Solving Approach

When faced with a bug or feature request:

1. UNDERSTAND: Read relevant files and understand current behavior
2. ANALYZE: Identify root cause or required changes  
3. PLAN: Outline approach in 2-3 steps
4. IMPLEMENT: Make minimal changes to achieve goal
5. VERIFY: Run tests and check behavior
6. DOCUMENT: Update comments/docs if needed

Example:
```
User: "Fix the login form validation"

Agent:
Thought: I need to understand the current validation logic.
Action: Read
Action Input: {"path": "components/LoginForm.tsx"}

[...reads file...]

Thought: The issue is missing email format validation. I'll add Zod schema.
Action: Edit
Action Input: {
  "path": "components/LoginForm.tsx",
  "changes": [...]
}

[...makes changes...]

Thought: Now I should test this works.
Action: Bash
Action Input: {"command": "npm run test:unit components/LoginForm.test.tsx"}
```
```

### 3. **Self-Consistency & Validation**

```markdown
## Self-Verification Protocol

Before finalizing changes:

1. **Type Safety Check**
   - Action: Bash(npx tsc --noEmit <file>)
   - Verify: No type errors

2. **Linting Check**
   - Action: Bash(npx eslint --fix <file>)
   - Verify: No lint errors  

3. **Format Check**
   - Action: Bash(npx prettier --write <file>)
   - Verify: Code formatted

4. **Test Check**
   - Action: Bash(npm test <file>.test.ts)
   - Verify: All tests pass

5. **Build Check** (if requested)
   - Action: Bash(npm run build)
   - Verify: Build succeeds

If ANY check fails, fix issues before proceeding.
```

***

## 🚀 Advanced Patterns

### Multi-Agent Orchestration

```markdown
# Orchestration Pattern: Feature Development

## Main Orchestrator Agent
Responsibilities:
- Break down feature into tasks  
- Delegate to specialist agents
- Coordinate dependencies
- Merge results

## Specialist Agents (Subagents)

### 1. Architect Agent
Purpose: Design data models and API contracts
Context: ARCHITECT.md with design patterns
Output: Schema files, API specs

### 2. Implementation Agent  
Purpose: Write actual code
Context: AGENTS.md with coding standards
Output: Component/function implementations

### 3. Testing Agent
Purpose: Generate comprehensive tests
Context: TEST_PATTERNS.md
Output: Test files with >80% coverage

### 4. Documentation Agent
Purpose: Write/update docs
Context: DOCS_STYLE.md  
Output: README, API docs, inline comments

## Coordination Flow
```
User Request
    ↓
[Orchestrator] → creates plan
    ↓
[Architect] → designs schema
    ↓  
[Implementation] → writes code
    ↓
[Testing] → generates tests
    ↓
[Documentation] → updates docs
    ↓
[Orchestrator] → reviews & integrates
```

## Implementation
Use slash command to spawn subagents:
```
/orchestrate "Build user profile feature"
```
```

### MCP Server Integration

**~/.claude/mcp-servers.json**:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/project"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "sentry": {
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server"],
      "env": {
        "SENTRY_TOKEN": "${SENTRY_TOKEN}",
        "SENTRY_ORG": "my-org"
      }
    }
  }
}
```

**Using MCP Tools in Prompts**:
```markdown
## Available MCP Integrations

### GitHub MCP Server
Tools available:
- create_issue(title, body, labels)
- create_pull_request(title, body, head, base)
- list_pull_requests(state, author)
- merge_pull_request(pr_number)

### Sentry MCP Server  
Tools available:
- get_recent_errors(project, time_range)
- get_issue_details(issue_id)
- resolve_issue(issue_id)

Use these tools when relevant to the task.
Example: After fixing bug, create PR with GitHub MCP.
```

***

## 📊 Production Workflows

### CI/CD Integration

```yaml
# .github/workflows/ai-code-review.yml
name: AI Code Review

on: [pull_request]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: AI Code Review
        run: |
          npx @anthropic-ai/claude-code \
            -p "Review PR changes for bugs, security issues, and style violations" \
            --dangerously-skip-permissions \
            --output-format stream-json \
            > review.json
      
      - name: Post Review
        uses: actions/github-script@v6
        with:
          script: |
            const review = require('./review.json');
            github.rest.pulls.createReview({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
              body: review.summary,
              event: review.hasIssues ? 'REQUEST_CHANGES' : 'APPROVE'
            });
```

### Pre-commit Hooks

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Run AI agent to fix common issues
claude -p "Fix lint errors in staged files" \
  --dangerously-skip-permissions \
  --output-format stream-json

# Stage any fixes
git add -u

# Verify tests still pass
npm test
```

***

## 🎓 Key Takeaways

### Essential Implementation Checklist

- [ ] **ReAct Loop**: Implement Thought → Action → Observation pattern
- [ ] **Context Files**: Create AGENTS.md with project rules (100-150 lines)
- [ ] **Slash Commands**: Build reusable commands for common workflows  
- [ ] **MCP Integration**: Connect to external tools via Model Context Protocol
- [ ] **Permission System**: Configure AllowedTools whitelist for safety
- [ ] **Hierarchical Context**: Support global, project, and directory-level configs
- [ ] **Subagent Pattern**: Enable delegation to specialist agents
- [ ] **Self-Verification**: Implement validation loops (test/lint/type-check)
- [ ] **Living Documentation**: Make context files team-maintained
- [ ] **Streaming Output**: Support JSON streaming for automation

### Critical Success Factors

1. **Lean Context**: Keep config files under 150 lines, reference don't inline
2. **Explicit Examples**: Show actual code patterns, not just rules
3. **Tool Constraints**: Define clear do's/don'ts for LLM tool usage
4. **Safety First**: Whitelist safe commands, blacklist dangerous ones
5. **Iterative Refinement**: Update AGENTS.md every time agent makes same mistake

***

**This architecture powers all major agentic CLI tools. The secret isn't the model—it's the prompt engineering, context management, and ReAct implementation.** Start with a minimal AGENTS.md, add slash commands for your top 5 workflows, and iterate from real usage. 🚀

[1](https://deepwiki.com/anthropics/claude-code)
[2](https://openai.com/index/gpt-5-1-codex-max/)
[3](https://www.zdnet.com/article/openais-codex-max-solves-one-of-my-biggest-ai-coding-annoyances-and-its-a-lot-faster/)
[4](https://venturebeat.com/ai/openai-debuts-gpt-5-1-codex-max-coding-model-and-it-already-completed-a-24)
[5](https://www.claude.com/product/claude-code)
[6](https://github.com/anthropics/claude-code)
[7](https://www.reddit.com/r/vibecoding/comments/1oa9d5o/best_ai_coding_tool_gemini_cli_codex_or_claude/)
[8](https://www.facebook.com/groups/techtitansgroup/posts/1519165509410762/)
[9](https://www.codeant.ai/blogs/claude-code-cli-vs-codex-cli-vs-gemini-cli-best-ai-cli-tool-for-developers-in-2025)
[10](https://www.reddit.com/r/ClaudeAI/comments/1lw5oie/how_phasebased_development_made_claude_code_10x/)
[11](https://codelabs.developers.google.com/gemini-cli-hands-on)
[12](https://developers.openai.com/codex/cli/)
[13](https://www.kdnuggets.com/top-5-agentic-coding-cli-tools)
[14](https://dev.to/holasoymalva/the-ultimate-claude-code-guide-every-hidden-trick-hack-and-power-feature-you-need-to-know-2l45)
[15](https://developers.google.com/gemini-code-assist/docs/gemini-cli)
[16](https://openai.com/index/introducing-codex/)
[17](https://www.youtube.com/watch?v=7fQcsPOm8ys)
[18](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
[19](https://codeassist.google)
[20](https://www.reddit.com/r/vibecoding/comments/1nkx0zc/which_cli_ai_coding_tool_to_use_right_now_codex/)
[21](https://www.anthropic.com/engineering/claude-code-best-practices)
[22](https://www.shuttle.dev/blog/2025/10/16/claude-code-best-practices)
[23](https://www.linkedin.com/pulse/mastering-codex-agent-configuration-files-complete-lozovsky-mba-zyh8c)
[24](https://github.com/hakonno/gemini-docs-template)
[25](https://apidog.com/blog/claude-md/)
[26](https://agentsmd.net)
[27](https://addyo.substack.com/p/gemini-cli-tips-and-tricks)
[28](https://www.reddit.com/r/ClaudeAI/comments/1k5slll/anthropics_guide_to_claude_code_best_practices/)
[29](https://www.builder.io/blog/agents-md)
[30](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-system-instruction)
[31](https://shipyard.build/blog/claude-code-cheat-sheet/)
[32](https://wandb.ai/wandb_fc/genai-research/reports/Introduction-to-Agents-md--VmlldzoxNDEwNDI2Ng)
[33](https://github.com/dontriskit/awesome-ai-system-prompts)
[34](https://modelcontextprotocol.info/specification/draft/architecture/)
[35](https://www.patronus.ai/llm-testing/advanced-prompt-engineering-techniques)
[36](https://www.dailydoseofds.com/ai-agents-crash-course-part-10-with-implementation/)
[37](https://www.descope.com/learn/post/mcp)
[38](https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-the-openai-api)
[39](https://www.reddit.com/r/AI_Agents/comments/1js1xjz/lets_build_our_own_agentic_loop_running_in_our/)
[40](https://modelcontextprotocol.io/docs/learn/architecture)
[41](https://www.augmentcode.com/blog/how-to-build-your-agent-11-prompting-techniques-for-better-ai-agents)
[42](https://www.promptingguide.ai/techniques/react)
[43](https://cloud.google.com/discover/what-is-model-context-protocol)
[44](https://kanerika.com/blogs/ai-prompt-engineering-best-practices/)
[45](https://rewire.it/blog/claude-code-agents-skills-slash-commands/)
[46](https://github.com/openai/codex/discussions/323)
[47](https://www.ksred.com/claude-code-dangerously-skip-permissions-when-to-use-it-and-when-you-absolutely-shouldnt/)
[48](https://jxnl.co/writing/2025/08/29/context-engineering-slash-commands-subagents/)
[49](https://eclipsesource.com/blogs/2025/11/20/mastering-project-context-files-for-ai-coding-agents/)
[50](https://blog.promptlayer.com/claude-dangerously-skip-permissions/)
[51](https://github.com/wshobson/commands)
[52](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html)
[53](https://www.youtube.com/watch?v=dAFtsnR0bn0)
[54](https://code.claude.com/docs/en/slash-commands)
[55](https://skywork.ai/blog/claude-memory-a-deep-dive-into-anthropics-persistent-context-solution/)
[56](https://www.reddit.com/r/ClaudeAI/comments/1oj96xc/do_you_use_dangerouslyskippermissions_how_do_you/)
Based on my research into Claude Code and agentic coding patterns, here's a **technical deep-dive** for building a production-grade CLI coding agent in TypeScript:

## Core Behavioral Patterns of Claude Code

**Agentic Loop Architecture:**
Claude Code operates on a **gather → plan → execute → verify → iterate** feedback loop:

1. **Context Gathering Phase** - Uses file reads, directory traversal, grep searches, and MCP (Model Context Protocol) integrations to build working memory
2. **Planning Phase** - Decomposes tasks into actionable steps, often delegating to specialized subagents for complex problems
3. **Execution Phase** - Makes targeted file edits, runs bash commands, executes tests
4. **Verification Phase** - Self-checks output (runs tests, visual screenshots, secondary LLM judges)
5. **Iteration Phase** - Refines based on errors/feedback until success criteria met

**Key Design Philosophy:**
- **Low-level and unopinionated** - Close to raw model access, no forced workflows
- **Safety-first** - Conservative allowlisting for system-modifying operations
- **Stateful conversations** - Maintains context across multiple interactions
- **Tool-driven** - Actions exposed as discrete tools (file ops, bash, MCP servers)

***

## Technical Architecture for Your CLI Tool

### **1. Core System Components**

```typescript
// Project Structure
├── src/
│   ├── index.ts              // CLI entry point
│   ├── agent/
│   │   ├── loop.ts           // Main agentic loop controller
│   │   ├── planner.ts        // Task decomposition
│   │   ├── executor.ts       // Tool orchestration
│   │   └── verifier.ts       // Self-verification logic
│   ├── tools/
│   │   ├── registry.ts       // Tool definition system
│   │   ├── file-ops.ts       // read_file, write_file, list_directory
│   │   ├── bash.ts           // shell command execution
│   │   ├── search.ts         // grep, ripgrep integration
│   │   └── mcp-bridge.ts     // MCP server connections (optional)
│   ├── llm/
│   │   ├── client.ts         // LLM API abstraction (Anthropic SDK)
│   │   ├── context.ts        // Conversation state management
│   │   └── streaming.ts      // Real-time response handling
│   ├── safety/
│   │   ├── allowlist.ts      // Permission system
│   │   ├── sandbox.ts        // Command validation
│   │   └── git-guard.ts      // Auto-commit checkpoints
│   └── config/
│       ├── claude-md.ts      // CLAUDE.md parser
│       └── settings.ts       // User preferences
├── package.json
└── tsconfig.json
```

### **2. Tool System Design**

**Tool Definition Interface:**
```typescript
// tools/registry.ts
interface ToolDefinition {
  name: string;
  description: string; // Natural language for LLM
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (input: any) => Promise<string>;
  requiresPermission?: boolean;
  allowPatterns?: string[]; // e.g., ["npm:*", "git commit:*"]
}

// Example: File Read Tool
export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read contents of a file at the given path. Use for understanding existing code.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path" }
    },
    required: ["path"]
  },
  handler: async ({ path }) => {
    const fullPath = join(process.cwd(), path);
    return await fs.readFile(fullPath, 'utf-8');
  },
  requiresPermission: false
};

// Example: Bash Tool
export const bashTool: ToolDefinition = {
  name: "bash",
  description: "Execute shell command. Use for running tests, builds, git operations.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Bash command to execute" }
    },
    required: ["command"]
  },
  handler: async ({ command }) => {
    // Check allowlist first
    if (!isCommandAllowed(command)) {
      throw new Error(`Permission denied: ${command}`);
    }
    const { stdout, stderr } = await execAsync(command);
    return stdout || stderr;
  },
  requiresPermission: true,
  allowPatterns: ["npm:*", "git commit:*", "git status", "yarn:*"]
};
```

**Tool Registry Pattern:**
```typescript
// tools/registry.ts
class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getForLLM(): Array<{ name: string; description: string; input_schema: any }> {
    // Format tools for Anthropic API tool use
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }));
  }

  async execute(name: string, input: any): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    
    // Permission check
    if (tool.requiresPermission && !await this.checkPermission(name, input)) {
      return `[Permission denied for ${name}]`;
    }
    
    return await tool.handler(input);
  }
}
```

### **3. Agentic Loop Implementation**

**Core Loop Controller:**
```typescript
// agent/loop.ts
class AgenticLoop {
  constructor(
    private llm: LLMClient,
    private toolRegistry: ToolRegistry,
    private context: ConversationContext
  ) {}

  async run(userPrompt: string): Promise<string> {
    this.context.addMessage({ role: "user", content: userPrompt });
    
    let iterationCount = 0;
    const MAX_ITERATIONS = 25; // Prevent infinite loops
    
    while (iterationCount++ < MAX_ITERATIONS) {
      // Call LLM with tool definitions
      const response = await this.llm.complete({
        messages: this.context.getMessages(),
        tools: this.toolRegistry.getForLLM(),
        max_tokens: 4096
      });
      
      // Check if done (text response, no tool calls)
      if (response.stop_reason === "end_turn") {
        return response.content.find(c => c.type === "text")?.text || "";
      }
      
      // Process tool calls
      if (response.stop_reason === "tool_use") {
        const toolUses = response.content.filter(c => c.type === "tool_use");
        const toolResults = await Promise.all(
          toolUses.map(async (toolUse) => {
            const result = await this.toolRegistry.execute(
              toolUse.name, 
              toolUse.input
            );
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result
            };
          })
        );
        
        // Add assistant message + tool results to context
        this.context.addMessage({ role: "assistant", content: response.content });
        this.context.addMessage({ role: "user", content: toolResults });
        
        continue; // Loop continues
      }
    }
    
    throw new Error("Max iterations reached");
  }
}
```

### **4. Context Management**

**CLAUDE.md Integration:**
```typescript
// config/claude-md.ts
interface ClaudeMdConfig {
  bashCommands?: Record<string, string>;
  codeStyle?: string[];
  workflow?: string[];
  allowedTools?: string[];
}

async function loadClaudeMd(projectRoot: string): Promise<ClaudeMdConfig> {
  const claudeMdPath = join(projectRoot, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) return {};
  
  const content = await fs.readFile(claudeMdPath, 'utf-8');
  // Parse markdown sections into structured config
  return parseMarkdownConfig(content);
}

// Add to system prompt
function buildSystemPrompt(config: ClaudeMdConfig): string {
  return `
You are an expert coding assistant with access to tools for file operations and bash commands.

Project Instructions:
${config.workflow?.join('\n') || 'No specific workflow defined.'}

Code Style:
${config.codeStyle?.join('\n') || 'Follow standard best practices.'}

Bash Commands:
${Object.entries(config.bashCommands || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Always verify your work by running tests or checking output.
`;
}
```

**Conversation Context:**
```typescript
// llm/context.ts
class ConversationContext {
  private messages: Array<Message> = [];
  private readonly MAX_TOKENS = 200_000; // Claude 3.5 Sonnet limit
  
  addMessage(message: Message) {
    this.messages.push(message);
    this.pruneIfNeeded();
  }
  
  getMessages(): Array<Message> {
    return this.messages;
  }
  
  private pruneIfNeeded() {
    // Estimate tokens, remove oldest user/assistant pairs if over limit
    const estimatedTokens = this.estimateTokenCount();
    if (estimatedTokens > this.MAX_TOKENS * 0.8) {
      // Remove middle messages, keep system + recent context
      this.messages = [
        this.messages[0], // system prompt
        ...this.messages.slice(-20) // last 20 messages
      ];
    }
  }
}
```

### **5. Safety & Permissions**

**Allowlist System:**
```typescript
// safety/allowlist.ts
interface AllowlistConfig {
  fileWrite: boolean;
  bashCommands: string[]; // Wildcard patterns
  dangerousOps: boolean;
}

class PermissionManager {
  private config: AllowlistConfig;
  
  async checkBashCommand(command: string): Promise<boolean> {
    // Check against wildcard patterns
    for (const pattern of this.config.bashCommands) {
      if (minimatch(command, pattern)) return true;
    }
    
    // Interactive prompt for unknown commands
    return await this.promptUser(`Allow: ${command}?`);
  }
  
  async checkFileWrite(path: string): Promise<boolean> {
    if (!this.config.fileWrite) {
      return await this.promptUser(`Write to ${path}?`);
    }
    return true;
  }
}
```

**Git Checkpoint System:**
```typescript
// safety/git-guard.ts
class GitCheckpoint {
  async createCheckpoint(message: string) {
    await execAsync(`git add -A`);
    await execAsync(`git commit -m "checkpoint: ${message}"`);
  }
  
  async rollback() {
    await execAsync(`git reset --hard HEAD~1`);
  }
}

// Use before risky operations
await gitCheckpoint.createCheckpoint("Before agent modification");
await agent.run("Refactor entire codebase");
// User can manually rollback if needed
```

### **6. CLI Interface**

**Commander.js Setup:**
```typescript
// src/index.ts
#!/usr/bin/env node

import { Command } from 'commander';
import { AgenticLoop } from './agent/loop';

const program = new Command();

program
  .name('your-agent')
  .description('Agentic CLI coding assistant')
  .version('1.0.0');

program
  .argument('[prompt]', 'Initial prompt for the agent')
  .option('-p, --prompt <text>', 'Inline prompt')
  .option('--headless', 'Run without interactive mode')
  .option('--allow-write', 'Auto-allow file writes')
  .option('--json', 'Output JSON results')
  .action(async (promptArg, options) => {
    const prompt = promptArg || options.prompt;
    
    if (!prompt && !options.headless) {
      // Interactive REPL mode
      await startInteractiveMode();
    } else {
      // Single-shot mode
      const agent = await initializeAgent(options);
      const result = await agent.run(prompt);
      
      if (options.json) {
        console.log(JSON.stringify({ result }));
      } else {
        console.log(result);
      }
    }
  });

program.parse();
```

**Interactive REPL:**
```typescript
import * as readline from 'readline';

async function startInteractiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'you> '
  });
  
  const agent = await initializeAgent({});
  
  rl.prompt();
  
  rl.on('line', async (line) => {
    if (line.trim() === 'exit') {
      rl.close();
      return;
    }
    
    try {
      const response = await agent.run(line);
      console.log(`\nagent> ${response}\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
    
    rl.prompt();
  });
}
```

### **7. Package Configuration**

**package.json:**
```json
{
  "name": "your-agent-cli",
  "version": "1.0.0",
  "description": "Agentic coding assistant CLI",
  "main": "dist/index.js",
  "bin": {
    "your-agent": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "prepare": "npm run build"
  },
  "keywords": ["ai", "agent", "cli", "coding", "llm"],
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "commander": "^11.0.0",
    "minimatch": "^9.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "ts-node": "^10.9.0"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "dist/**/*",
    "README.md"
  ]
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

***

## Advanced Patterns

### **Subagent Delegation:**
```typescript
// For complex tasks, spawn specialized subagents
async function investigateWithSubagent(query: string): Promise<string> {
  const subagent = new AgenticLoop(llm, toolRegistry, new ConversationContext());
  subagent.context.addMessage({
    role: "system",
    content: "You are a specialist investigator. Focus only on answering the specific question."
  });
  return await subagent.run(query);
}
```

### **Visual Verification (for UI work):**
```typescript
// Use Playwright MCP server for screenshot verification
const screenshotTool: ToolDefinition = {
  name: "take_screenshot",
  description: "Capture visual output of HTML/web page",
  handler: async ({ url }) => {
    // Calls Playwright via MCP
    const screenshot = await mcpClient.callTool("playwright", { action: "screenshot", url });
    return `Screenshot saved: ${screenshot.path}`;
  }
};
```

### **Streaming Responses:**
```typescript
// Real-time output for long-running operations
for await (const chunk of llm.streamComplete({ messages, tools })) {
  if (chunk.type === "content_block_delta") {
    process.stdout.write(chunk.delta.text);
  }
}
```

***

## Key Insights for Production Quality

1. **Token Budget Management** - Claude Code uses context pruning to stay under 200k token limits
2. **Wildcard Permissions** - Use patterns like `npm:*` instead of individual command allowlisting
3. **Self-Verification** - Build verification into the loop (run tests, check outputs)
4. **Minimal Tool Surface** - Start with 4-5 core tools (read/write/list/bash/search), expand as needed
5. **CLAUDE.md as First-Class Config** - Auto-inject project context into system prompt
6. **Checkpoint System** - Auto-commit before risky operations for easy rollback
7. **Streaming UX** - Show thinking in real-time for better developer experience
8. **Headless Mode** - Support both interactive REPL and one-shot CLI for CI/CD integration

This architecture gives you a production-ready foundation that mirrors Claude Code's core behavioral patterns while remaining framework-agnostic and npm-installable. The TypeScript implementation ensures type safety across your tool system and makes it easy for senior engineers to extend.

[1](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
[2](https://www.claude.com/blog/how-anthropic-teams-use-claude-code)
[3](https://github.com/MrMarciaOng/ccsetup)
[4](https://www.anthropic.com/engineering/claude-code-best-practices)
[5](https://www.anthropic.com/engineering/multi-agent-research-system)
[6](https://www.linkedin.com/posts/curiouslychase_claude-code-pro-tip-instead-of-adding-individual-activity-7377708837451202560-bw4t)
[7](https://www.reddit.com/r/ClaudeAI/comments/1k5slll/anthropics_guide_to_claude_code_best_practices/)
[8](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
[9](https://www.npmjs.com/package/claude-code-templates)
[10](https://uxdesign.cc/designing-with-claude-code-and-codex-cli-building-ai-driven-workflows-powered-by-code-connect-ui-f10c136ec11f)
[11](https://blog.logrocket.com/building-typescript-cli-node-js-commander/)
[12](https://www.reddit.com/r/AI_Agents/comments/1i2olbq/using_bash_scripting_to_get_ai_agents_make/)
[13](https://arxiv.org/html/2505.06817v1)
[14](https://dev.to/akshaynathan/building-a-typescript-cli-26h5)
[15](https://docs.databricks.com/aws/en/generative-ai/guide/agent-system-design-patterns)
[16](https://www.freecodecamp.org/news/how-to-build-rag-ai-agents-with-typescript/)
[17](https://ghuntley.com/agent/)
[18](https://research.aimultiple.com/agentic-ai-design-patterns/)
[19](https://stackoverflow.com/questions/41853422/how-to-compile-typescript-using-npm-command)

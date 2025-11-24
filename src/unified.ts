#!/usr/bin/env node
// Unified CLI, REPL, Agent Loop, System Prompt, and Parser
import { Command } from 'commander';
import inquirer from 'inquirer';
import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import type { LLMProvider } from './providers/base.js';
import type { ToolRegistry } from './tools/registry.js';
import type { Message } from './types.js';
import type { ToolCall } from './tools/types.js';
import type { ProjectConfig } from './types.js';
import type { SessionState, ApprovalSubject, ReasoningMode } from './session/state.js';
import { SessionState as SessionStateClass } from './session/state.js';
import { SessionTracker } from './session/tracker.js';
import { SlashCommandLoader } from './commands/slash-commands.js';
import { CommandRegistry } from './commands/registry.js';
import { CerebrasClient } from './cerebras-client.js';
import { QuotaTracker } from './quota-tracker.js';
import { listAvailableModels, getModelConfig, isValidModel, getModelProvider } from './models.js';
import { getCerebrasConfig, getOpenAIConfig, loadProjectConfig, getModelConfig as getModelConfigFromConfig } from './config.js';
import { OpenAIProvider } from './providers/openai.js';
import { FileManager } from './file-manager.js';
import { ToolRegistry as ToolRegistryClass } from './tools/registry.js';
import { toolDefinitions } from './tools/definitions.js';
import { debugLog, debugError } from './utils/debug.js';

process.env.NODE_ENV = process.env.NODE_ENV || 'false';
const isDebug = process.env.NODE_ENV === 'false';

// ============================================================================
// PARSER
// ============================================================================

type ParsedAssistantResponse =
  | { type: 'final'; message: string }
  | { type: 'tool_calls'; calls: ToolCall[] };

function tryParseJson(text: string): any | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]+?)```/i);
    if (jsonBlockMatch) {
      try {
        return JSON.parse(jsonBlockMatch[1]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseAssistantResponse(raw: string): ParsedAssistantResponse | null {
  const payload = tryParseJson(raw);
  if (payload && typeof payload === 'object') {
    if (typeof payload.final_response === 'string') {
      return { type: 'final', message: payload.final_response };
    }

    if (Array.isArray(payload.tool_calls)) {
      const calls: ToolCall[] = payload.tool_calls
        .map((call: Record<string, unknown>) => {
          if (!call || typeof call !== 'object') return null;
          if (typeof call.name !== 'string' || typeof call.id !== 'string') return null;
          if (!call.input || typeof call.input !== 'object') return null;
          return { id: call.id, name: call.name, input: call.input };
        })
        .filter(Boolean) as ToolCall[];

      if (calls.length) {
        return { type: 'tool_calls', calls };
      }
    }
  }

  // Try parsing markdown-style tool calls
  const actionMatch = raw.match(/\*\*Action:\*\*\s*(\w+)/);
  
  if (actionMatch) {
    const actionName = actionMatch[1];
    debugLog('Parser: Found action:', actionName);
    
    const actionInputStart = raw.indexOf('**Action Input:**');
    if (actionInputStart !== -1) {
      const jsonStart = raw.indexOf('{', actionInputStart);
      if (jsonStart !== -1) {
        let braceCount = 0;
        let jsonEnd = jsonStart;
        let inString = false;
        let escapeNext = false;
        
        for (let i = jsonStart; i < raw.length; i++) {
          const char = raw[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
        }
        
        const actionInput = raw.substring(jsonStart, jsonEnd);
        debugLog('Parser: Extracted JSON length:', actionInput.length);
        
        try {
          const input = JSON.parse(actionInput);
          debugLog('Parser: Successfully parsed JSON');
          const calls: ToolCall[] = [{
            id: `call-${Date.now()}`,
            name: actionName,
            input
          }];
          return { type: 'tool_calls', calls };
        } catch (error) {
          debugError('Parser: Failed to parse JSON:', error);
          return null;
        }
      }
    }
  }

  return null;
}

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

const ROLE_AND_IDENTITY = `
# ROLE & IDENTITY
You are an expert coding agent operating in the user's terminal environment.
You understand codebases, execute commands, and help developers code faster.
You are Cerebras CLI Agent, a Claude Code-style AI pair programmer with direct tool access.
`;

const CORE_CAPABILITIES = `
# CORE CAPABILITIES
You can:
- Edit files and fix bugs across the codebase
- Answer questions about architecture and code logic
- Run tests, linters, and other developer commands
- Execute Git operations (search history, resolve conflicts, create commits/PRs)
- Use bash tools and system commands
- Invoke MCP servers for extended functionality (if configured)
`;

const REACT_LOOP_PATTERN = `
# REASONING PATTERN (ReAct Loop)
Always follow the ReAct loop:
1. THOUGHT: Analyze the situation and decide what to do next
   - Gather context (inspect files, configs, history)
   - Plan explicit steps before editing (share a short numbered list)
   - Consider edge cases and potential issues
2. ACTION: Select the appropriate tool and provide valid arguments
   - Use tools to gather information or make changes
   - Execute using tools (read/write files, list directories, run allowed bash commands)
3. OBSERVATION: Process the result and determine next steps
   - Verify by rerunning relevant commands or comparing diffs
   - Check for errors and handle them appropriately
4. Repeat until task is complete

Always keep changes minimal, deterministic, and reversible. Prefer editing existing files over creating new ones unless necessary.
`;

const RESPONSE_FORMAT = `
# RESPONSE FORMAT
Structure your responses as:

**Thought:** [Your reasoning about what to do]
**Action:** [Tool name]
**Action Input:** {"arg1": "value1", "arg2": "value2"}

Wait for Observation, then continue reasoning.

When task is complete, provide Final Answer without Action.

**JSON Format (for tool calls):**
- When you need tools, respond ONLY with JSON: {"tool_calls":[{"id":"call-1","name":"read_file","input":{"path":"src/index.ts"}}]}
- Each tool call must include a stable id, tool name, and input object.
- After tools return results, you MUST provide a final response summarizing what was done.
- When you are ready to answer the user, respond ONLY with JSON: {"final_response":"concise answer here"}.
- IMPORTANT: After executing tools, always provide a final_response that summarizes the actions taken and results.

**Text Format (for reasoning):**
You can also use natural language with Thought/Action/Observation markers:
Thought: [reasoning]
Action: read_file
Action Input: {"path": "src/index.ts"}

After executing actions, always provide a summary of what was done.

Never emit raw HTML instructions or step-by-step IDE directions. Communicate as an autonomous coding agent.
Keep final responses short (<= 200 words) and include verification notes (tests run, files changed).

**CRITICAL: Maintain conversation context**
- You have access to the FULL conversation history - all previous user messages and your responses
- ALWAYS reference previous messages and actions when responding to follow-up questions
- If the user asks about something you did earlier, refer back to those specific actions and results
- When the user says "yes", "continue", "do it", etc., refer back to what was discussed in the previous messages
- Build upon previous interactions - don't start from scratch if you've already discussed something
- Read the conversation history carefully before responding to understand the full context
`;

const TOOL_USAGE_GUIDELINES = `
# TOOL USAGE GUIDELINES
- ALWAYS use tools - never hallucinate file contents or outputs
- Read files before modifying them
- Run tests after code changes
- Commit related changes together with descriptive messages
- Ask clarifying questions when requirements are ambiguous
- Use file-scoped commands (single file tests/lint) over full builds when possible
`;

const SAFETY_AND_PERMISSIONS = `
# SAFETY & PERMISSIONS
- Ask before destructive operations (rm, chmod, data deletion) unless auto-approved
- Validate inputs before executing commands
- Check command outputs for errors before proceeding
- Use file-scoped commands (single file tests/lint) over full builds
- Honor approval settings provided by the host CLI before running write_file or run_bash
- Do not attempt to bypass host restrictions
`;

const CODE_QUALITY_STANDARDS = `
# CODE QUALITY STANDARDS
- Follow project conventions defined in AGENTS.md/CLAUDE.md
- Write tests for new functionality
- Run linters and type checkers
- Keep changes minimal and focused
- Prefer small, atomic commits
- Use TypeScript strict mode - all types must be explicit
- Follow existing code patterns and style
`;

const SELF_VERIFICATION_PROTOCOL = `
# SELF-VERIFICATION PROTOCOL
Before finalizing changes, verify:

1. **Type Safety Check**
   - Run: npx tsc --noEmit <file>
   - Verify: No type errors

2. **Linting Check**
   - Run: npx eslint --fix <file>
   - Verify: No lint errors

3. **Format Check**
   - Run: npx prettier --write <file>
   - Verify: Code formatted

4. **Test Check** (if applicable)
   - Run: npm test <file>.test.ts
   - Verify: All tests pass

5. **Build Check** (if requested)
   - Run: npm run build
   - Verify: Build succeeds

If ANY check fails, fix issues before proceeding.
`;

function buildSystemPrompt(
  registry: ToolRegistry,
  projectConfig: ProjectConfig,
  sessionState: SessionState,
): string {
  const projectInstructions = projectConfig.instructions
    ? `# PROJECT CONTEXT\n${projectConfig.instructions}\n`
    : '';

  const toolsOverview = `# AVAILABLE TOOLS\n${registry.listSummaries()}`;

  const supplemental = sessionState.customSystemInstruction
    ? `# ADDITIONAL USER INSTRUCTIONS\n${sessionState.customSystemInstruction}\n`
    : '';

  const reasoning = `# REASONING PREFERENCE\nMode: ${sessionState.getReasoning()}\nDescription: ${sessionState.reasoningDescription()}`;
  
  const mentions = sessionState.getMentions();
  const mentionBlock = mentions.length
    ? `# FOCUS FILES\n${mentions.map((path) => `- ${path}`).join('\n')}\n`
    : '';
  
  const approvals = `# TOOL APPROVAL POLICY\n${sessionState.approvalsSummary()}\nEnforced by CLI. Do not attempt to bypass host restrictions.`;

  return [
    ROLE_AND_IDENTITY.trim(),
    CORE_CAPABILITIES.trim(),
    REACT_LOOP_PATTERN.trim(),
    RESPONSE_FORMAT.trim(),
    TOOL_USAGE_GUIDELINES.trim(),
    SAFETY_AND_PERMISSIONS.trim(),
    CODE_QUALITY_STANDARDS.trim(),
    SELF_VERIFICATION_PROTOCOL.trim(),
    toolsOverview,
    reasoning,
    approvals,
    mentionBlock.trim(),
    projectInstructions.trim(),
    supplemental.trim(),
    '# FINAL INSTRUCTIONS\nAlways cite the tools you used in the final summary (e.g., read_file(src/index.ts), run_bash(npm run build)).',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ============================================================================
// AGENTIC LOOP
// ============================================================================

interface AgentLoopOptions {
  maxIterations?: number;
  stream?: boolean;
  systemPrompt?: string;
}

class AgenticLoop {
  private messages: Message[] = [];
  private readonly client: LLMProvider;
  private readonly tools: ToolRegistry;
  private readonly maxIterations: number;
  private currentSystemPrompt: string;

  constructor(
    client: LLMProvider,
    tools: ToolRegistry,
    initialSystemPrompt: string,
    options?: AgentLoopOptions,
  ) {
    this.client = client;
    this.tools = tools;
    this.maxIterations = options?.maxIterations ?? 20;
    this.currentSystemPrompt = initialSystemPrompt;
    this.messages.push({ role: 'system', content: initialSystemPrompt });
  }

  reset(systemPrompt: string): void {
    this.currentSystemPrompt = systemPrompt;
    this.messages = [{ role: 'system', content: systemPrompt }];
  }

  updateSystemPrompt(systemPrompt: string): void {
    this.currentSystemPrompt = systemPrompt;
    const systemIndex = this.messages.findIndex(msg => msg.role === 'system');
    if (systemIndex !== -1) {
      this.messages[systemIndex] = { role: 'system', content: systemPrompt };
    } else {
      this.messages.unshift({ role: 'system', content: systemPrompt });
    }
  }

  updateClient(client: LLMProvider): void {
    (this as any).client = client;
  }

  async run(userPrompt: string, options?: AgentLoopOptions): Promise<string> {
    debugLog('AgenticLoop.run() called');
    debugLog('userPrompt length:', userPrompt.length);
    debugLog('Current message count before adding user prompt:', this.messages.length);
    if (options?.systemPrompt) {
      debugLog('Resetting with system prompt');
      this.reset(options.systemPrompt);
    }
    this.messages.push({ role: 'user', content: userPrompt });
    debugLog('Message count after adding user prompt:', this.messages.length);
    const spinner = ora('Agent thinking...').start();
    debugLog('Spinner started');

    try {
      let iteration = 0;
      let lastResponse = '';

      while (iteration++ < this.maxIterations) {
        debugLog('Agent loop iteration:', iteration);
        debugLog('Calling client.chat with', this.messages.length, 'messages in history');
        const response = (await this.client.chat(this.messages, options?.stream ?? false)) as string;
        debugLog('client.chat completed, response length:', response.length);
        lastResponse = response;
        debugLog('Parsing response...');
        const parsed = parseAssistantResponse(response);
        debugLog('Parsed result:', parsed ? `type=${parsed.type}` : 'null');

        if (!parsed) {
          debugLog('No parse result, returning raw response');
          spinner.stop();
          this.messages.push({ role: 'assistant', content: response });
          debugLog('Message count after adding assistant response:', this.messages.length);
          return response.trim();
        }

        if (parsed.type === 'final') {
          debugLog('Final response type, returning');
          spinner.stop();
          this.messages.push({ role: 'assistant', content: parsed.message });
          debugLog('Message count after adding final response:', this.messages.length);
          return parsed.message.trim();
        }

        if (parsed.type === 'tool_calls') {
          debugLog('Tool calls detected, count:', parsed.calls.length);
          spinner.text = `Running ${parsed.calls.length} tool${parsed.calls.length > 1 ? 's' : ''}...`;
          this.messages.push({ role: 'assistant', content: lastResponse });
          debugLog('Added assistant response with tool calls to history');
          
          for (const call of parsed.calls) {
            debugLog('Executing tool:', call.name, 'id:', call.id);
            try {
              const result = await this.tools.execute(call);
              debugLog('Tool execution completed, result length:', result?.length || 0);
              const toolResultMessage = [
                `TOOL_RESULT ${call.id}`,
                `name: ${call.name}`,
                'output:',
                result,
              ].join('\n');
              this.messages.push({ role: 'user', content: toolResultMessage });
              debugLog('Added tool result to history');
            } catch (err) {
              debugError('Tool execution error:', err);
              const errorMessage = err instanceof Error ? err.message : 'Unknown tool error';
              this.messages.push({
                role: 'user',
                content: `TOOL_RESULT ${call.id}\nname: ${call.name}\nerror: ${errorMessage}`,
              });
              debugLog('Added tool error to history');
            }
          }
          
          debugLog('Message count after tool execution:', this.messages.length);
          spinner.text = 'Agent thinking...';
          debugLog('Continuing loop after tool execution');
          continue;
        }
      }

      debugLog('Max iterations exceeded');
      spinner.stop();
      throw new Error('Exceeded maximum tool iterations.');
    } catch (error) {
      debugError('Error in AgenticLoop.run():', error);
      spinner.stop();
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Agent loop failed: ${message}`);
    }
  }

  compactHistory(note?: string): void {
    const systemMessage = this.messages.find((msg) => msg.role === 'system')?.content ?? this.currentSystemPrompt;
    this.messages = [
      { role: 'system', content: systemMessage },
      {
        role: 'assistant',
        content: note || 'Conversation compacted manually; request a recap from the user if additional context is needed.',
      },
    ];
  }

  getHistory(): Message[] {
    return [...this.messages];
  }
}

// ============================================================================
// REPL
// ============================================================================

const SLASH_COMMANDS = [
  { name: '/init', desc: 'scaffold AGENTS.md with Codex instructions' },
  { name: '/status', desc: 'show current model, reasoning mode, approvals, mentions, and tool usage counts' },
  { name: '/approvals', desc: 'choose which tool categories (write_file, run_bash) are auto-approved' },
  { name: '/model', desc: 'switch reasoning style (fast, balanced, thorough)' },
  { name: '/switch-model', desc: 'switch to a different model' },
  { name: '/mention <path>', desc: 'highlight files/directories the agent must focus on (/mention clear resets)' },
  { name: '/compact', desc: 'summarize recent turns and trim context to avoid token pressure' },
  { name: '/quit', desc: 'exit and display the session summary' },
];

const TEXT_COMMANDS = [
  { name: 'help', desc: 'show help information and tips' },
  { name: 'clear', desc: 'clear conversation history and reset system prompt' },
  { name: 'exit', desc: 'exit the REPL (same as /quit)' },
];

type PromptBuilder = () => string;

const APPROVAL_CHOICES: { name: string; value: ApprovalSubject }[] = [
  { name: 'Write files (write_file)', value: 'write_file' },
  { name: 'Run bash commands (run_bash)', value: 'run_bash' },
];

const REASONING_CHOICES: { name: string; value: ReasoningMode }[] = [
  { name: 'Fast (shallow reasoning)', value: 'fast' },
  { name: 'Balanced', value: 'balanced' },
  { name: 'Thorough (deep reasoning)', value: 'thorough' },
];

const LARGE_PASTE_THRESHOLD = 500;

class REPL {
  private readonly agent: AgenticLoop;
  private readonly buildPrompt: PromptBuilder;
  private readonly sessionState: SessionState;
  private readonly tracker: SessionTracker;
  private readonly commandRegistry: CommandRegistry;
  private client: LLMProvider;
  private quotaTracker?: QuotaTracker;
  private rl: readline.Interface | null = null;
  private isProcessing = false;
  private pendingCommands: Set<string> = new Set();
  private isPaused = false;
  
  constructor(
    agent: AgenticLoop,
    buildPrompt: PromptBuilder,
    sessionState: SessionState,
    tracker: SessionTracker,
    client: LLMProvider,
    quotaTracker?: QuotaTracker,
    commandRegistry?: CommandRegistry,
  ) {
    this.agent = agent;
    this.buildPrompt = buildPrompt;
    this.sessionState = sessionState;
    this.tracker = tracker;
    this.client = client;
    this.quotaTracker = quotaTracker;
    this.commandRegistry = commandRegistry || new CommandRegistry(new SlashCommandLoader());
  }

  async start(): Promise<void> {
    debugLog('REPL.start() called');
    const asciiArt = `
 ██████╗███████╗██████╗ ███████╗██████╗ ██████╗  █████╗ ███████╗
██╔════╝██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔════╝
██║     █████╗  ██████╔╝█████╗  ██████╔╝██████╔╝███████║███████╗
██║     ██╔══╝  ██╔══██╗██╔══╝  ██╔══██╗██╔══██╗██╔══██║╚════██║
╚██████╗███████╗██║  ██║███████╗██████╔╝██║  ██║██║  ██║███████║
 ╚═════╝╚══════╝╚═╝  ╚═╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝                                                                           
`;
    console.log(chalk.cyan(asciiArt));
    console.log(chalk.cyan.bold('Cerebras Code CLI — Agentic Mode\n'));
    
    debugLog('Loading slash commands...');
    await this.commandRegistry.load();
    const customCommands = this.commandRegistry.list();
    debugLog('Slash commands loaded:', customCommands.length);

    console.log(chalk.gray('\nStart chatting with the agent. Type "/" for available commands.\n'));

    debugLog('Configuring approvals...');
    await this.configureApprovals(true);
    debugLog('Approvals configured');

    debugLog('Resetting agent with system prompt...');
    this.agent.reset(this.buildPrompt());
    debugLog('Agent reset complete');

    debugLog('Creating readline interface...');
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('> '),
    });
    debugLog('Readline interface created, rl:', !!this.rl);

    debugLog('Setting up readline event handlers...');
    return new Promise<void>((resolve) => {
      debugLog('Promise executor running');
      
      this.rl!.on('line', (input: string) => {
        debugLog('Line event received, input:', input.substring(0, 50));
        this.handleInput(input).catch((error) => {
          debugError('Error in handleInput:', error);
          console.error(
            chalk.red(
              `\n❌ Input handling error: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
            ),
          );
          if (this.rl) {
            if (this.isPaused) {
              this.rl.resume();
              this.isPaused = false;
            }
            if (process.stdin.readable && !process.stdin.destroyed) {
              this.rl.prompt();
            }
          }
        });
      });

      this.rl!.on('close', () => {
        debugLog('Readline close event fired');
        this.printSessionSummary();
        debugLog('Resolving promise - REPL is closing');
        resolve();
      });

      this.rl!.on('SIGINT', () => {
        debugLog('SIGINT received');
        console.log('\n');
        this.rl!.close();
      });

      debugLog('Showing initial prompt');
      this.rl!.prompt();
      debugLog('REPL.start() promise setup complete, waiting for events...');
    });
  }

  private async handleInput(input: string): Promise<void> {
    debugLog('handleInput called, input:', input.substring(0, 50));
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    if (!trimmed) {
      debugLog('Empty input, reprompting');
      this.rl!.prompt();
      return;
    }

    if (this.isLargePaste(trimmed)) {
      debugLog('Large paste detected');
      const shouldProcess = await this.previewAndConfirmPaste(trimmed);
      if (!shouldProcess) {
        console.log(chalk.gray('Paste cancelled.\n'));
        this.rl!.prompt();
        return;
      }
    }

    if (trimmed.startsWith('/')) {
      debugLog('Slash command detected:', trimmed);
      this.executeSlashCommandAsync(trimmed);
      return;
    }

    if (lower === 'exit' || lower === 'quit') {
      debugLog('Exit command detected');
      this.rl!.close();
      return;
    }

    if (lower === 'clear') {
      debugLog('Clear command detected');
      this.agent.reset(this.buildPrompt());
      console.log(chalk.yellow('\n🔄 Conversation cleared; system prompt refreshed.\n'));
      this.rl!.prompt();
      return;
    }

    if (lower === 'help') {
      debugLog('Help command detected');
      this.showHelp();
      this.rl!.prompt();
      return;
    }

    debugLog('Processing as agent input');
    this.processInputAsync(trimmed);
  }

  private async executeSlashCommandAsync(raw: string): Promise<void> {
    const commandId = `${Date.now()}-${Math.random()}`;
    this.pendingCommands.add(commandId);

    try {
      const shouldExit = await this.handleSlashCommand(raw);
      if (shouldExit) {
        this.rl!.close();
      }
    } catch (error) {
      console.error(
        chalk.red(
          `\n❌ Command failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
        ),
      );
    } finally {
      this.pendingCommands.delete(commandId);
      if (this.rl && this.pendingCommands.size === 0 && !this.isProcessing && !this.isPaused) {
        try {
          this.rl.prompt();
        } catch (err) {
          debugError('Error reprompting:', err);
        }
      }
    }
  }

  private async processInputAsync(input: string): Promise<void> {
    if (this.isProcessing) {
      console.log(chalk.yellow('\n⏳ Previous request still processing. Please wait...\n'));
      if (this.rl) {
        this.rl.prompt();
      }
      return;
    }

    this.isProcessing = true;
    try {
      await this.processInput(input);
    } catch (error) {
      console.error(
        chalk.red(
          `\n❌ Agent failed: ${error instanceof Error ? error.message : 'Unknown error'}\nUse "/compact" or "/clear" if the context is inconsistent.\n`,
        ),
      );
    } finally {
      this.isProcessing = false;
      if (this.rl) {
        try {
          if (process.stdin.isPaused()) {
            debugLog('stdin was paused, resuming...');
            process.stdin.resume();
          }
          if (this.isPaused) {
            debugLog('readline was paused, resuming...');
            this.rl.resume();
            this.isPaused = false;
          }
          if (process.stdin.readable && !process.stdin.destroyed) {
            this.rl.prompt();
            debugLog('Reprompted successfully');
          }
        } catch (err) {
          debugError('Error reprompting:', err);
        }
      }
    }
  }

  private async processInput(input: string): Promise<void> {
    debugLog('processInput called');
    try {
      debugLog('Calling agent.run...');
      const response = await this.agent.run(input);
      debugLog('agent.run completed, response length:', response.length);
      console.log(chalk.blueBright('\nAgent:\n'));
      console.log(`${response}\n`);
      debugLog('Response printed');
    } catch (error) {
      debugError('Error in processInput:', error);
      console.error(
        chalk.red(
          `\n❌ Agent failed: ${error instanceof Error ? error.message : 'Unknown error'}\nUse "/compact" or "/clear" if the context is inconsistent.\n`,
        ),
      );
      throw error;
    }
  }

  private async handleSlashCommand(raw: string): Promise<boolean> {
    const [command, ...rest] = raw.slice(1).split(' ');
    const commandName = command.toLowerCase();
    
    const customCommand = this.commandRegistry.get(commandName);
    if (customCommand) {
      await this.handleCustomCommand(customCommand, rest);
      return false;
    }
    
    switch (commandName) {
      case 'init': {
        const spinner = ora('Checking AGENTS.md...').start();
        try {
          await this.handleInit();
          spinner.succeed('AGENTS.md created successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (errorMessage.includes('already exists')) {
            spinner.warn('AGENTS.md already exists');
            console.log(chalk.gray('\nUse /status to review instructions.\n'));
          } else {
            spinner.fail(`Failed to create AGENTS.md: ${errorMessage}`);
          }
        }
        return false;
      }
      case 'status': {
        const spinner = ora('Loading status...').start();
        this.printStatus();
        spinner.stop();
        return false;
      }
      case 'approvals': {
        this.rl!.pause();
        this.isPaused = true;
        await this.configureApprovals(false);
        this.agent.updateSystemPrompt(this.buildPrompt());
        this.rl!.resume();
        this.isPaused = false;
        return false;
      }
      case 'model': {
        this.rl!.pause();
        this.isPaused = true;
        await this.configureReasoning();
        this.agent.updateSystemPrompt(this.buildPrompt());
        this.rl!.resume();
        this.isPaused = false;
        return false;
      }
      case 'switch-model': {
        this.rl!.pause();
        this.isPaused = true;
        await this.switchModel();
        this.agent.updateSystemPrompt(this.buildPrompt());
        this.rl!.resume();
        this.isPaused = false;
        return false;
      }
      case 'mention': {
        const spinner = ora('Updating mentions...').start();
        try {
          await this.handleMention(rest.join(' '));
          spinner.succeed('Mentions updated');
        } catch (error) {
          spinner.fail(`Failed to update mentions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        this.agent.updateSystemPrompt(this.buildPrompt());
        return false;
      }
      case 'compact': {
        const spinner = ora('Compacting conversation history...').start();
        try {
          this.handleCompact();
          spinner.succeed('Conversation compacted');
        } catch (error) {
          spinner.fail(`Failed to compact: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return false;
      }
      case 'quit':
        return true;
      default:
        if (commandName === '') {
          this.showCommandPreview();
        } else {
          console.log(chalk.yellow(`\nUnknown slash command: ${raw}\n`));
        }
        return false;
    }
  }

  private async handleCustomCommand(command: import('./commands/slash-commands.js').SlashCommand, args: string[]): Promise<void> {
    const spinner = ora(`Executing custom command: /${command.name}`).start();
    try {
      const loader = new SlashCommandLoader();
      const content = await loader.executeCommand(command, args, {
        projectRoot: process.cwd(),
        currentDir: process.cwd(),
      });
      spinner.succeed(`Custom command /${command.name} loaded`);
      await this.processInput(content);
    } catch (error) {
      spinner.fail(`Failed to execute /${command.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleInit(): Promise<void> {
    const agentsPath = join(process.cwd(), 'AGENTS.md');
    try {
      await access(agentsPath, constants.F_OK);
      throw new Error('AGENTS.md already exists. Use /status to review instructions.');
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        throw error;
      }
    }

    const template = `# Codex Agent Guidelines

- Follow the gather → plan → execute → verify loop documented in docs/research-development.md.
- Use structured tool calls (read_file, write_file, list_directory, search_text, run_bash) instead of free-form instructions.
- Keep responses concise (<= 200 words) and cite the tools used in each summary.
- Never emit HTML or IDE-style tutorials. Communicate as an autonomous coding agent.
- Honor approval settings provided by the host CLI before running write_file or run_bash.
`;
    await writeFile(agentsPath, template, 'utf-8');
    this.tracker.recordFileChange('AGENTS.md', null, template);
  }

  private printStatus(): void {
    const mentionList = this.sessionState.getMentions();
    const toolCounts = this.tracker.getToolCounts();
    const toolSummary = Object.keys(toolCounts).length
      ? Object.entries(toolCounts)
          .map(([name, count]) => `    ${name}: ${count}`)
          .join('\n')
      : '    (none)';
    console.log('\nCurrent session status:\n');
    console.log(`  Model:         ${this.sessionState.getModelName()}`);
    
    if (this.quotaTracker) {
      const quotaUsage = this.quotaTracker.getQuotaUsage();
      console.log(`  Quota usage:`);
      console.log(`    Requests:    ${quotaUsage.requests.minute}/${quotaUsage.limits.requests.minute} (min), ${quotaUsage.requests.hour}/${quotaUsage.limits.requests.hour} (hour), ${quotaUsage.requests.day}/${quotaUsage.limits.requests.day} (day)`);
      console.log(`    Tokens:      ${quotaUsage.tokens.minute.toLocaleString()}/${quotaUsage.limits.tokens.minute.toLocaleString()} (min), ${quotaUsage.tokens.hour.toLocaleString()}/${quotaUsage.limits.tokens.hour.toLocaleString()} (hour), ${quotaUsage.tokens.day.toLocaleString()}/${quotaUsage.limits.tokens.day.toLocaleString()} (day)`);
    }
    
    console.log(`  Reasoning:     ${this.sessionState.getReasoning()} (${this.sessionState.reasoningDescription()})`);
    console.log(`  Approvals:     ${this.sessionState.approvalsSummary()}`);
    console.log(`  Mentions:      ${mentionList.length ? mentionList.join(', ') : '(none)'}`);
    console.log(`  API calls:     ${this.tracker.getApiCalls()}`);
    console.log(`  Tool usage:\n${toolSummary}\n`);
  }

  private async configureApprovals(initial: boolean): Promise<void> {
    debugLog('configureApprovals called, initial:', initial);
    
    if (initial) {
      debugLog('Setting default approvals: write_file=true, run_bash=true');
      this.sessionState.setApprovals({
        write_file: true,
        run_bash: true,
      });
      console.log(chalk.gray(`\nApproval policy set: ${this.sessionState.approvalsSummary()}\n`));
      return;
    }
    
    if (!process.stdin.isTTY) {
      console.log(chalk.gray(`\nApproval policy: ${this.sessionState.approvalsSummary()}\n`));
      return;
    }

    console.log('');
    const { approvals } = await inquirer.prompt<{ approvals: ApprovalSubject[] }>([
      {
        type: 'checkbox',
        name: 'approvals',
        message: 'Update auto-approval settings:',
        choices: APPROVAL_CHOICES.map((choice) => ({
          ...choice,
          checked: this.sessionState.isAutoApproved(choice.value),
        })),
      },
    ]);
    const approvalMap: Partial<Record<ApprovalSubject, boolean>> = {};
    APPROVAL_CHOICES.forEach((choice) => {
      approvalMap[choice.value] = approvals.includes(choice.value);
    });
    this.sessionState.setApprovals(approvalMap);
    console.log(chalk.gray(`\nApproval policy updated: ${this.sessionState.approvalsSummary()}\n`));
  }

  private async configureReasoning(): Promise<void> {
    const { reasoning } = await inquirer.prompt<{ reasoning: ReasoningMode }>([
      {
        type: 'list',
        name: 'reasoning',
        message: 'Select reasoning mode:',
        choices: REASONING_CHOICES.map((choice) => ({
          ...choice,
          checked: choice.value === this.sessionState.getReasoning(),
        })),
        default: this.sessionState.getReasoning(),
      },
    ]);
    this.sessionState.setReasoning(reasoning);
    console.log(chalk.gray(`\nReasoning preference set to ${reasoning}.\n`));
  }

  private async switchModel(): Promise<void> {
    const availableModels = listAvailableModels();
    const currentModel = this.sessionState.getModelName();
    
    const { modelName } = await inquirer.prompt<{ modelName: string }>([
      {
        type: 'list',
        name: 'modelName',
        message: 'Select model:',
        choices: availableModels.map((name) => ({
          name: `${name}${name === currentModel ? ' (current)' : ''}`,
          value: name,
        })),
        default: currentModel,
      },
    ]);

    if (modelName === currentModel) {
      console.log(chalk.gray(`\nModel is already set to ${modelName}.\n`));
      return;
    }

    try {
      if (!isValidModel(modelName)) {
        throw new Error(`Invalid model: ${modelName}`);
      }

      const modelConfig = getModelConfig(modelName);

      if (!modelConfig) {
        throw new Error(`Model config not found: ${modelName}`);
      }

      const newQuotaTracker = new QuotaTracker(modelConfig);
      const provider = getModelProvider(modelName);
      let newClient: LLMProvider;
      
      if (provider === 'openai') {
        const openaiConfig = getOpenAIConfig(modelName);
        newClient = new OpenAIProvider(openaiConfig);
      } else {
        const cerebrasConfig = getCerebrasConfig(modelName);
        newClient = new CerebrasClient(cerebrasConfig, this.tracker, newQuotaTracker);
      }

      this.sessionState.setModelName(modelName);
      this.agent.updateClient(newClient);
      this.client = newClient;
      this.quotaTracker = newQuotaTracker;

      console.log(chalk.green(`\n✓ Model switched to ${modelName}`));
      console.log(chalk.gray(`  Max context: ${modelConfig.maxContextLength.toLocaleString()} tokens`));
      console.log(chalk.gray(`  Request quota: ${modelConfig.quota.requests.minute}/min, ${modelConfig.quota.requests.hour}/hour, ${modelConfig.quota.requests.day}/day`));
      console.log(chalk.gray(`  Token quota: ${modelConfig.quota.tokens.minute.toLocaleString()}/min, ${modelConfig.quota.tokens.hour.toLocaleString()}/hour, ${modelConfig.quota.tokens.day.toLocaleString()}/day\n`));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red(`\n❌ Failed to switch model: ${errorMessage}\n`));
      throw error;
    }
  }

  private async handleMention(argument: string): Promise<void> {
    const trimmed = argument.trim();
    if (!trimmed) {
      const { path } = await inquirer.prompt<{ path: string }>([
        { type: 'input', name: 'path', message: 'File or folder to mention:' },
      ]);
      this.sessionState.addMention(path);
    } else if (trimmed.toLowerCase() === 'clear') {
      this.sessionState.clearMentions();
    } else {
      this.sessionState.addMention(trimmed);
    }
  }

  private handleCompact(): void {
    const summary = this.buildConversationSummary();
    this.agent.compactHistory(`Summary preserved:\n${summary}`);
  }

  private buildConversationSummary(): string {
    const history = this.agent
      .getHistory()
      .filter((message) => message.role !== 'system')
      .slice(-10);
    if (!history.length) {
      return '(no prior context)';
    }
    return history
      .map((message) => {
        const prefix = message.role === 'user' ? 'User' : 'Agent';
        const singleLine = message.content.replace(/\s+/g, ' ').trim();
        return `${prefix}: ${singleLine.slice(0, 180)}${singleLine.length > 180 ? '…' : ''}`;
      })
      .join('\n');
  }

  private showHelp(): void {
    console.log(chalk.cyan('\nAgent Help'));
    console.log(
      chalk.gray(
        'You interact with a Claude Code-style agent. It plans work, calls tools, and summarizes results. Use slash commands for configuration.',
      ),
    );
    console.log(
      chalk.gray(
        'Examples: "/approvals" to adjust safety prompts, "/model" to toggle reasoning style, "/mention src/index.ts" to prioritize a file.',
      ),
    );
    console.log(chalk.gray('Use "/compact" if responses grow long, and "/quit" to end the session with a summary.\n'));
  }

  private printSessionSummary(): void {
    console.log('\n' + this.tracker.buildSummary(this.sessionState.getModelName()) + '\n');
  }

  private isLargePaste(input: string): boolean {
    return input.length >= LARGE_PASTE_THRESHOLD;
  }

  private async previewAndConfirmPaste(input: string): Promise<boolean> {
    const charCount = input.length;
    const lineCount = input.split('\n').length;
    const previewLines = input.split('\n').slice(0, 5);
    const preview = previewLines.map((line) => `  ${line}`).join('\n');
    const hasMore = lineCount > 5;

    console.log(chalk.gray(`\n[Pasted Content ${charCount} chars, ${lineCount} lines]`));
    if (lineCount > 1) {
      console.log(chalk.gray('Preview:'));
      console.log(chalk.gray(preview));
      if (hasMore) {
        console.log(chalk.gray(`  ... (${lineCount - 5} more lines)`));
      }
    }
    console.log('');

    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Process this pasted content?',
        default: true,
      },
    ]);

    return confirm;
  }

  private showCommandPreview(): void {
    console.log('\n' + chalk.cyan('Available Slash Commands:'));
    SLASH_COMMANDS.forEach((cmd) => {
      console.log(chalk.green(`  ${cmd.name.padEnd(18)}`) + chalk.gray(cmd.desc));
    });

    console.log(chalk.cyan('\nAvailable Text Commands:'));
    TEXT_COMMANDS.forEach((cmd) => {
      console.log(chalk.green(`  ${cmd.name.padEnd(18)}`) + chalk.gray(cmd.desc));
    });

    console.log('');
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

interface CliOptions {
  prompt?: string;
  system?: string;
  stream?: boolean;
  listFiles?: boolean;
  structure?: boolean;
  yolo?: boolean;
  'dangerously-skip-permissions'?: boolean;
  'output-format'?: 'text' | 'stream-json';
  model?: string;
  listModels?: boolean;
}

const program = new Command();
program
  .name('cerebras-code')
  .description('AI coding agent powered by Cerebras ultra-fast inference')
  .version('1.0.0')
  .option('-p, --prompt <text>', 'Single prompt mode (non-interactive)')
  .option('-s, --system <text>', 'Custom system prompt')
  .option('--no-stream', 'Disable streaming output')
  .option('--list-files', 'List project files')
  .option('--structure', 'Show project structure')
  .option('--yolo', 'YOLO mode: auto-approve all operations (use with caution)')
  .option('--dangerously-skip-permissions', 'Skip permission prompts (alias for --yolo)')
  .option('--output-format <format>', 'Output format: text or stream-json', 'text')
  .option('-m, --model <model>', 'Select model to use')
  .option('--list-models', 'List all available models and their limits')
  .parse(process.argv);

const options = program.opts<CliOptions>();

async function handlePromptMode(
  agent: AgenticLoop,
  prompt: string,
  systemPrompt: string,
  tracker: SessionTracker,
  sessionState: SessionState,
): Promise<void> {
  try {
    const response = await agent.run(prompt, { systemPrompt, stream: false });
    console.log(chalk.blueBright(`\n${response}\n`));
    console.log(tracker.buildSummary(sessionState.getModelName()));
  } catch (error) {
    throw error instanceof Error ? error : new Error('Prompt mode failed');
  }
}

async function main(): Promise<void> {
  try {
    if (options.listModels) {
      const models = listAvailableModels();
      console.log(chalk.cyan('\nAvailable Models:\n'));
      for (const modelName of models) {
        const config = getModelConfigFromConfig(modelName);
        if (config) {
          console.log(chalk.green(`  ${modelName}`));
          console.log(chalk.gray(`    Max Context Length: ${config.maxContextLength.toLocaleString()} tokens`));
          console.log(chalk.gray(`    Request Quota: ${config.quota.requests.minute}/min, ${config.quota.requests.hour}/hour, ${config.quota.requests.day}/day`));
          console.log(chalk.gray(`    Token Quota: ${config.quota.tokens.minute.toLocaleString()}/min, ${config.quota.tokens.hour.toLocaleString()}/hour, ${config.quota.tokens.day.toLocaleString()}/day`));
          console.log('');
        }
      }
      return;
    }

    const selectedModel = options.model || process.env.CEREBRAS_MODEL || process.env.OPENAI_MODEL || 'qwen-3-235b-a22b-instruct-2507';
    const provider = isValidModel(selectedModel) ? getModelProvider(selectedModel) : 
                     (process.env.OPENAI_API_KEY ? 'openai' : 'cerebras');
    
    const projectConfig = await loadProjectConfig();
    const modelConfig = getModelConfigFromConfig(selectedModel);

    if (isDebug) {
      console.log('[debug] CLI options:', options);
      console.log('[debug] Project config:', projectConfig);
      console.log('[debug] Provider:', provider);
      console.log('[debug] Selected model:', selectedModel);
      if (modelConfig) {
        console.log('[debug] Model config:', modelConfig);
      }
    }

    const tracker = new SessionTracker();
    const quotaTracker = modelConfig ? new QuotaTracker(modelConfig) : undefined;
    
    let client: LLMProvider;
    if (provider === 'openai') {
      const openaiConfig = getOpenAIConfig(options.model);
      client = new OpenAIProvider(openaiConfig);
    } else {
      const cerebrasConfig = getCerebrasConfig(options.model);
      client = new CerebrasClient(cerebrasConfig, tracker, quotaTracker);
    }
    
    const sessionState = new SessionStateClass(selectedModel, options.system);
    
    if (options.yolo || options['dangerously-skip-permissions']) {
      sessionState.setPermissionMode('yolo');
    } else if (options.prompt) {
      sessionState.setPermissionMode('auto-accept');
    }
    
    const fileManager = new FileManager(process.cwd(), projectConfig.excludedPaths);
    const toolRegistry = new ToolRegistryClass(
      toolDefinitions,
      {
        fileManager,
        projectRoot: process.cwd(),
      },
      {
        sessionState,
        tracker,
        interactive: !options.prompt,
      },
    );

    const systemPromptBuilder = () => buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    const agent = new AgenticLoop(client, toolRegistry, systemPromptBuilder());

    if (options.listFiles) {
      const pattern =
        projectConfig.allowedPaths && projectConfig.allowedPaths.length > 0
          ? `{${projectConfig.allowedPaths.join(',')}}`
          : '**/*';
      const spinner = ora('Loading files...').start();
      const files = await fileManager.listFiles(pattern);
      spinner.stop();
      console.log(chalk.cyan('\n📁 Project Files:\n'));
      files.forEach((file) => console.log(chalk.gray(` ${file}`)));
      console.log(chalk.gray(`\nTotal: ${files.length} files\n`));
      return;
    }

    if (options.structure) {
      const spinner = ora('Building structure...').start();
      const structure = await fileManager.getProjectStructure();
      spinner.stop();
      console.log(chalk.cyan(`\n${structure}\n`));
      return;
    }

    const commandLoader = new SlashCommandLoader();
    const commandRegistry = new CommandRegistry(commandLoader);
    await commandRegistry.load();

    if (options.prompt) {
      await handlePromptMode(agent, options.prompt, systemPromptBuilder(), tracker, sessionState);
      return;
    }

    debugLog('Creating REPL instance...');
    const repl = new REPL(agent, systemPromptBuilder, sessionState, tracker, client, quotaTracker, commandRegistry);
    debugLog('REPL instance created');
    debugLog('Calling repl.start()...');
    await repl.start();
    debugLog('repl.start() completed');
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    if (isDebug && error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red(`\n❌ Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`));
  if (isDebug && reason instanceof Error && reason.stack) {
    console.error(chalk.gray(reason.stack));
  }
});

process.stdin.resume();
debugLog('stdin resumed, isTTY:', process.stdin.isTTY);

const keepAliveInterval = setInterval(() => {
  // Keep event loop alive
}, 1000);

process.on('SIGINT', () => {
  debugLog('SIGINT received, clearing keepAliveInterval');
  clearInterval(keepAliveInterval);
  process.exit(0);
});

process.on('exit', (code) => {
  debugLog('Process exiting with code:', code);
  clearInterval(keepAliveInterval);
});

main()
  .then(() => {
    debugLog('main() completed');
  })
  .catch((error) => {
    debugError('Error in main():', error);
    console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    if (isDebug && error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    clearInterval(keepAliveInterval);
    process.exit(1);
  });

if (!process.stdin.isTTY) {
  process.stdin.on('end', () => {
    debugLog('stdin ended (non-TTY mode)');
    clearInterval(keepAliveInterval);
    process.exit(0);
  });
}


import inquirer from 'inquirer';
import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { AgenticLoop } from './agent/loop.js';
import { SessionState, type ApprovalSubject, type ReasoningMode } from './session/state.js';
import { SessionTracker } from './session/tracker.js';
import { SlashCommandLoader } from './commands/slash-commands.js';
import { CommandRegistry } from './commands/registry.js';
import { CerebrasClient } from './cerebras-client.js';
import { QuotaTracker } from './quota-tracker.js';
import { listAvailableModels, getModelConfig, isValidModel, getModelProvider } from './models.js';
import { getCerebrasConfig, getOpenAIConfig } from './config.js';
import { OpenAIProvider } from './providers/openai.js';
import type { LLMProvider } from './providers/base.js';
import { debugLog, debugError } from './utils/debug.js';

// Command definitions for preview
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

// Threshold for showing paste summary instead of full content
const LARGE_PASTE_THRESHOLD = 500; // characters

export class REPL {
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
    // Load slash commands
    await this.commandRegistry.load();
    const customCommands = this.commandRegistry.list();
    debugLog('Slash commands loaded:', customCommands.length);

    console.log(chalk.gray('\nStart chatting with the agent. Type "/" for available commands.\n'));

    debugLog('Configuring approvals...');
    await this.configureApprovals(true);
    debugLog('Approvals configured');

    // Ensure the latest system prompt is active after approvals setup
    debugLog('Resetting agent with system prompt...');
    this.agent.reset(this.buildPrompt());
    debugLog('Agent reset complete');

    // Create readline interface for input
    debugLog('Creating readline interface...');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('> '),
    });
    debugLog('Readline interface created, rl:', !!this.rl);

    debugLog('Setting up readline event handlers...');
    return new Promise<void>((resolve) => {
      debugLog('Promise executor running');
      
      this.rl!.on('line', async (input: string) => {
        debugLog('Line event received, input:', input.substring(0, 50));
        try {
          await this.handleInput(input);
          debugLog('handleInput completed successfully');
        } catch (error) {
          // Ensure errors in handleInput don't crash the REPL
          debugError('Error in handleInput:', error);
          console.error(
            chalk.red(
              `\n❌ Input handling error: ${error instanceof Error ? error.message : 'Unknown error'}\n`,
            ),
          );
          if (this.rl) {
            debugLog('Reprompting after error');
            this.rl.prompt();
          } else {
            debugLog('ERROR: rl is null after error!');
          }
        }
      });

      this.rl!.on('close', () => {
        debugLog('Readline close event fired');
        debugLog('Stack trace:', new Error().stack);
        this.printSessionSummary();
        debugLog('Resolving promise - REPL is closing');
        resolve();
      });

      // Handle Ctrl+C
      this.rl!.on('SIGINT', () => {
        debugLog('SIGINT received');
        console.log('\n');
        this.rl!.close();
      });

      debugLog('Showing initial prompt');
      this.rl!.prompt();
      debugLog('REPL.start() promise setup complete, waiting for events...');
      debugLog('Readline interface state - isPaused:', this.rl!.getPrompt());
      debugLog('Process stdin state - readable:', process.stdin.readable, 'destroyed:', process.stdin.destroyed);
    });
  }

  private async handleInput(input: string): Promise<void> {
    debugLog('handleInput called, input:', input.substring(0, 50));
    debugLog('rl exists:', !!this.rl);
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();
    debugLog('trimmed:', trimmed.substring(0, 50), 'lower:', lower.substring(0, 50));

    if (!trimmed) {
      debugLog('Empty input, reprompting');
      this.rl!.prompt();
      return;
    }

    // Show preview and confirm for large pastes before processing
    if (this.isLargePaste(trimmed)) {
      debugLog('Large paste detected');
      const shouldProcess = await this.previewAndConfirmPaste(trimmed);
      if (!shouldProcess) {
        console.log(chalk.gray('Paste cancelled.\n'));
        this.rl!.prompt();
        return;
      }
    }

    // Handle slash commands (non-blocking)
    if (trimmed.startsWith('/')) {
      debugLog('Slash command detected:', trimmed);
      // Execute command asynchronously without blocking input
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

    // Process agent input (non-blocking)
    debugLog('Processing as agent input');
    this.processInputAsync(trimmed);
    debugLog('processInputAsync called (non-blocking), reprompting immediately');
    this.rl!.prompt();
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
      if (this.pendingCommands.size === 0 && !this.isProcessing) {
        this.rl!.prompt();
      }
    }
  }

  private async processInputAsync(input: string): Promise<void> {
    debugLog('processInputAsync called, input length:', input.length);
    debugLog('isProcessing:', this.isProcessing);
    debugLog('rl exists:', !!this.rl);
    debugLog('pendingCommands.size:', this.pendingCommands.size);
    
    if (this.isProcessing) {
      debugLog('Already processing, skipping');
      console.log(chalk.yellow('\n⏳ Previous request still processing. Please wait...\n'));
      if (this.rl) {
        this.rl.prompt();
      }
      return;
    }

    debugLog('Setting isProcessing to true');
    this.isProcessing = true;
    try {
      debugLog('Calling processInput...');
      await this.processInput(input);
      debugLog('processInput completed successfully');
    } catch (error) {
      debugError('Error in processInput:', error);
      console.error(
        chalk.red(
          `\n❌ Agent failed: ${error instanceof Error ? error.message : 'Unknown error'}\nUse "/compact" or "/clear" if the context is inconsistent.\n`,
        ),
      );
    } finally {
      debugLog('Finally block: setting isProcessing to false');
      this.isProcessing = false;
      // Ensure readline interface is still open before prompting
      debugLog('Checking if should reprompt: rl=', !!this.rl, 'pendingCommands=', this.pendingCommands.size);
      if (this.rl && this.pendingCommands.size === 0) {
        debugLog('Reprompting...');
        try {
          // Check if readline is still valid before prompting
          if (process.stdin.readable && !process.stdin.destroyed) {
            this.rl.prompt();
            debugLog('Reprompt complete');
          } else {
            debugError('ERROR: stdin is not readable or destroyed!');
            debugError('stdin.readable:', process.stdin.readable);
            debugError('stdin.destroyed:', process.stdin.destroyed);
          }
        } catch (error) {
          debugError('ERROR reprompting:', error);
          debugError('Error stack:', error instanceof Error ? error.stack : 'no stack');
        }
      } else {
        debugLog('Not reprompting - rl:', !!this.rl, 'pendingCommands:', this.pendingCommands.size);
      }
    }
  }

  private async processInput(input: string): Promise<void> {
    debugLog('processInput called');
    debugLog('rl exists:', !!this.rl);
    debugLog('input:', input.substring(0, 100));
    try {
      debugLog('Calling agent.run...');
      const response = await this.agent.run(input);
      debugLog('agent.run completed, response length:', response.length);
      console.log(chalk.blueBright('\nAgent:\n'));
      console.log(`${response}\n`);
      debugLog('Response printed');
    } catch (error) {
      debugError('Error in processInput:', error);
      if (error instanceof Error) {
        debugError('Error stack:', error.stack);
      }
      console.error(
        chalk.red(
          `\n❌ Agent failed: ${error instanceof Error ? error.message : 'Unknown error'}\nUse "/compact" or "/clear" if the context is inconsistent.\n`,
        ),
      );
      throw error; // Re-throw to be caught by processInputAsync
    }
  }

  private async handleSlashCommand(raw: string): Promise<boolean> {
    const [command, ...rest] = raw.slice(1).split(' ');
    const commandName = command.toLowerCase();
    
    // Check for custom slash commands first
    const customCommand = this.commandRegistry.get(commandName);
    if (customCommand) {
      await this.handleCustomCommand(customCommand, rest);
      return false;
    }
    
    // Built-in commands
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
        // Pause readline for interactive prompt
        this.rl!.pause();
        await this.configureApprovals(false);
        this.agent.reset(this.buildPrompt());
        this.rl!.resume();
        return false;
      }
      case 'model': {
        // Pause readline for interactive prompt
        this.rl!.pause();
        await this.configureReasoning();
        this.agent.reset(this.buildPrompt());
        this.rl!.resume();
        return false;
      }
      case 'switch-model': {
        // Pause readline for interactive prompt
        this.rl!.pause();
        await this.switchModel();
        this.agent.reset(this.buildPrompt());
        this.rl!.resume();
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
        this.agent.reset(this.buildPrompt());
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
        // If just "/" is entered, show command help instead of error
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
      
      // Execute the command content as a prompt to the agent
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
      // File does not exist; proceed to create.
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
    
    // Show quota usage if available
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
    debugLog('process.stdin.isTTY:', process.stdin.isTTY);
    
    // Set default approvals for write_file and run_bash
    if (initial) {
      debugLog('Setting default approvals: write_file=true, run_bash=true');
      this.sessionState.setApprovals({
        write_file: true,
        run_bash: true,
      });
      console.log(chalk.gray(`\nApproval policy set: ${this.sessionState.approvalsSummary()}\n`));
      return;
    }
    
    // Skip interactive prompts when stdin is not a TTY (piped input)
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
    // Note: readline should be paused before calling this if in REPL mode
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
      // Validate model
      if (!isValidModel(modelName)) {
        throw new Error(`Invalid model: ${modelName}`);
      }

      // Get model config
      const modelConfig = getModelConfig(modelName);

      if (!modelConfig) {
        throw new Error(`Model config not found: ${modelName}`);
      }

      // Create new quota tracker
      const newQuotaTracker = new QuotaTracker(modelConfig);

      // Create new client based on provider
      const provider = getModelProvider(modelName);
      let newClient: LLMProvider;
      
      if (provider === 'openai') {
        const openaiConfig = getOpenAIConfig(modelName);
        newClient = new OpenAIProvider(openaiConfig);
      } else {
        const cerebrasConfig = getCerebrasConfig(modelName);
        newClient = new CerebrasClient(cerebrasConfig, this.tracker, newQuotaTracker);
      }

      // Update session state
      this.sessionState.setModelName(modelName);

      // Update client in agent
      this.agent.updateClient(newClient);

      // Update local references
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

    console.log(''); // Empty line
  }
}

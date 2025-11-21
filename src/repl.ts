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
  private rl: readline.Interface | null = null;
  private isProcessing = false;
  private pendingCommands: Set<string> = new Set();
  
  constructor(
    agent: AgenticLoop,
    buildPrompt: PromptBuilder,
    sessionState: SessionState,
    tracker: SessionTracker,
    commandRegistry?: CommandRegistry,
  ) {
    this.agent = agent;
    this.buildPrompt = buildPrompt;
    this.sessionState = sessionState;
    this.tracker = tracker;
    this.commandRegistry = commandRegistry || new CommandRegistry(new SlashCommandLoader());
  }

  async start(): Promise<void> {
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
    
    // Load slash commands
    await this.commandRegistry.load();
    const customCommands = this.commandRegistry.list();
    
    // Display available commands
    console.log(chalk.yellow.bold('Available Commands:\n'));
    
    // Slash commands with descriptions
    console.log(chalk.cyan('  Slash Commands:'));
    const slashCommands = [
      { name: '/init', desc: 'scaffold AGENTS.md with Codex instructions' },
      { name: '/status', desc: 'show current model, reasoning mode, approvals, mentions, and tool usage counts' },
      { name: '/approvals', desc: 'choose which tool categories (write_file, run_bash) are auto-approved' },
      { name: '/model', desc: 'switch reasoning style (fast, balanced, thorough)' },
      { name: '/mention <path>', desc: 'highlight files/directories the agent must focus on (/mention clear resets)' },
      { name: '/compact', desc: 'summarize recent turns and trim context to avoid token pressure' },
      { name: '/quit', desc: 'exit and display the session summary' },
    ];
    
    slashCommands.forEach((cmd) => {
      console.log(chalk.green(`    ${cmd.name.padEnd(20)}`) + chalk.gray(cmd.desc));
    });
    
    // Non-slash commands
    console.log(chalk.cyan('\n  Text Commands:'));
    const textCommands = [
      { name: 'help', desc: 'show help information and tips' },
      { name: 'clear', desc: 'clear conversation history and reset system prompt' },
      { name: 'exit', desc: 'exit the REPL (same as /quit)' },
    ];
    
    textCommands.forEach((cmd) => {
      console.log(chalk.green(`    ${cmd.name.padEnd(20)}`) + chalk.gray(cmd.desc));
    });
    
    // Custom commands if any
    if (customCommands.length > 0) {
      console.log(chalk.cyan('\n  Custom Slash Commands:'));
      customCommands.forEach((cmd) => {
        const desc = cmd.description || `Custom command: ${cmd.name}`;
        console.log(chalk.green(`    /${cmd.name.padEnd(18)}`) + chalk.gray(desc));
      });
    }
    
    console.log(chalk.gray('\nType "help" for more tips or start chatting with the agent.\n'));

    await this.configureApprovals(true);

    // Ensure the latest system prompt is active after approvals setup
    this.agent.reset(this.buildPrompt());

    // Create readline interface for non-blocking input
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('> '),
    });

    return new Promise<void>((resolve) => {
      this.rl!.on('line', async (input: string) => {
        await this.handleInput(input);
      });

      this.rl!.on('close', () => {
        this.printSessionSummary();
        resolve();
      });

      // Handle Ctrl+C
      this.rl!.on('SIGINT', () => {
        console.log('\n');
        this.rl!.close();
      });

      this.rl!.prompt();
    });
  }

  private async handleInput(input: string): Promise<void> {
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    if (!trimmed) {
      this.rl!.prompt();
      return;
    }

    // Show preview and confirm for large pastes before processing
    if (this.isLargePaste(trimmed)) {
      const shouldProcess = await this.previewAndConfirmPaste(trimmed);
      if (!shouldProcess) {
        console.log(chalk.gray('Paste cancelled.\n'));
        this.rl!.prompt();
        return;
      }
    }

    // Handle slash commands (non-blocking)
    if (trimmed.startsWith('/')) {
      // Execute command asynchronously without blocking input
      this.executeSlashCommandAsync(trimmed);
      this.rl!.prompt();
      return;
    }

    if (lower === 'exit' || lower === 'quit') {
      this.rl!.close();
      return;
    }

    if (lower === 'clear') {
      this.agent.reset(this.buildPrompt());
      console.log(chalk.yellow('\n🔄 Conversation cleared; system prompt refreshed.\n'));
      this.rl!.prompt();
      return;
    }

    if (lower === 'help') {
      this.showHelp();
      this.rl!.prompt();
      return;
    }

    // Process agent input (non-blocking)
    this.processInputAsync(trimmed);
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
    if (this.isProcessing) {
      console.log(chalk.yellow('\n⏳ Previous request still processing. Please wait...\n'));
      this.rl!.prompt();
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
      if (this.pendingCommands.size === 0) {
        this.rl!.prompt();
      }
    }
  }

  private async processInput(input: string): Promise<void> {
    try {
      const response = await this.agent.run(input);
      console.log(chalk.blueBright('\nAgent:\n'));
      console.log(`${response}\n`);
    } catch (error) {
      console.error(
        chalk.red(
          `\n❌ Agent failed: ${error instanceof Error ? error.message : 'Unknown error'}\nUse "/compact" or "/clear" if the context is inconsistent.\n`,
        ),
      );
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
        await this.configureModel();
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
        console.log(chalk.yellow(`\nUnknown slash command: ${raw}\n`));
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
    console.log(`  Model:         ${this.sessionState.getModelName()} (fixed)`);
    console.log(`  Reasoning:     ${this.sessionState.getReasoning()} (${this.sessionState.reasoningDescription()})`);
    console.log(`  Approvals:     ${this.sessionState.approvalsSummary()}`);
    console.log(`  Mentions:      ${mentionList.length ? mentionList.join(', ') : '(none)'}`);
    console.log(`  API calls:     ${this.tracker.getApiCalls()}`);
    console.log(`  Tool usage:\n${toolSummary}\n`);
  }

  private async configureApprovals(initial: boolean): Promise<void> {
    if (!initial) {
      console.log('');
    }
    const { approvals } = await inquirer.prompt<{ approvals: ApprovalSubject[] }>([
      {
        type: 'checkbox',
        name: 'approvals',
        message: initial
          ? 'Select operations that should be auto-approved (space to toggle, enter to confirm):'
          : 'Update auto-approval settings:',
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

  private async configureModel(): Promise<void> {
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
}

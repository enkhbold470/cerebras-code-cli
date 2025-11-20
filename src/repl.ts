import inquirer from 'inquirer';
import chalk from 'chalk';
import { writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { AgenticLoop } from './agent/loop.js';
import { SessionState, type ApprovalSubject, type ReasoningMode } from './session/state.js';
import { SessionTracker } from './session/tracker.js';

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

export class REPL {
  private readonly agent: AgenticLoop;
  private readonly buildPrompt: PromptBuilder;
  private readonly sessionState: SessionState;
  private readonly tracker: SessionTracker;
  constructor(
    agent: AgenticLoop,
    buildPrompt: PromptBuilder,
    sessionState: SessionState,
    tracker: SessionTracker,
  ) {
    this.agent = agent;
    this.buildPrompt = buildPrompt;
    this.sessionState = sessionState;
    this.tracker = tracker;
  }

  async start(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Cerebras Code CLI — Agentic Mode'));
    console.log(
      chalk.gray(
        'Commands: /init, /status, /approvals, /model, /mention <path>, /compact, /quit. Type "help" for tips.\n',
      ),
    );

    await this.configureApprovals(true);

    try {
      // Ensure the latest system prompt is active after approvals setup
      this.agent.reset(this.buildPrompt());

      while (true) {
        let input: string;
        try {
          const answer = await inquirer.prompt<{ input: string }>([
            {
              type: 'input',
              name: 'input',
              message: chalk.green('You:'),
              prefix: '',
            },
          ]);
          input = answer.input;
        } catch (error) {
          if ((error as Error).name === 'ExitPromptError') {
            console.log('\n');
            break;
          }
          throw error;
        }
        const trimmed = input.trim();
        const lower = trimmed.toLowerCase();

        if (!trimmed) continue;

        if (trimmed.startsWith('/')) {
          const shouldExit = await this.handleSlashCommand(trimmed);
          if (shouldExit) break;
          continue;
        }

        if (lower === 'exit' || lower === 'quit') {
          break;
        }

        if (lower === 'clear') {
          this.agent.reset(this.buildPrompt());
          console.log(chalk.yellow('\n🔄 Conversation cleared; system prompt refreshed.\n'));
          continue;
        }

        if (lower === 'help') {
          this.showHelp();
          continue;
        }

        await this.processInput(trimmed);
      }
    } finally {
      this.printSessionSummary();
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
    switch (command.toLowerCase()) {
      case 'init':
        await this.handleInit();
        return false;
      case 'status':
        this.printStatus();
        return false;
      case 'approvals':
        await this.configureApprovals(false);
        this.agent.reset(this.buildPrompt());
        return false;
      case 'model':
        await this.configureModel();
        this.agent.reset(this.buildPrompt());
        return false;
      case 'mention':
        await this.handleMention(rest.join(' '));
        this.agent.reset(this.buildPrompt());
        return false;
      case 'compact':
        this.handleCompact();
        return false;
      case 'quit':
        return true;
      default:
        console.log(chalk.yellow(`\nUnknown slash command: ${raw}\n`));
        return false;
    }
  }

  private async handleInit(): Promise<void> {
    const agentsPath = join(process.cwd(), 'AGENTS.md');
    try {
      await access(agentsPath, constants.F_OK);
      console.log(chalk.gray('\nAGENTS.md already exists. Use /status to review instructions.\n'));
      return;
    } catch {
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
    console.log(chalk.green('\nCreated AGENTS.md with default Codex instructions.\n'));
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
      console.log(chalk.gray('\nMention list cleared.\n'));
      return;
    } else {
      this.sessionState.addMention(trimmed);
    }
    console.log(chalk.gray(`\nMentions: ${this.sessionState.getMentions().join(', ')}\n`));
  }

  private handleCompact(): void {
    const summary = this.buildConversationSummary();
    this.agent.compactHistory(`Summary preserved:\n${summary}`);
    console.log(chalk.gray('\nConversation compacted. Future turns will reference the stored summary.\n'));
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
    console.log(chalk.cyan('\n📚 Agent Help'));
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
}

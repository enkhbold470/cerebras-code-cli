import inquirer from 'inquirer';
import chalk from 'chalk';
import { AgenticLoop } from './agent/loop.js';

type PromptBuilder = () => string;

export class REPL {
  private readonly agent: AgenticLoop;
  private readonly buildPrompt: PromptBuilder;

  constructor(agent: AgenticLoop, buildPrompt: PromptBuilder) {
    this.agent = agent;
    this.buildPrompt = buildPrompt;
  }

  async start(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Cerebras Code CLI — Agentic Mode'));
    console.log(chalk.gray('Type "exit" to quit, "clear" to reset context, "help" for guidance.\n'));

    while (true) {
      const { input } = await inquirer.prompt<{ input: string }>([
        {
          type: 'input',
          name: 'input',
          message: chalk.green('You:'),
          prefix: '',
        },
      ]);

      const trimmed = input.trim();
      const lower = trimmed.toLowerCase();

      if (!trimmed) continue;
      if (lower === 'exit' || lower === 'quit') {
        console.log(chalk.cyan('\n👋 Goodbye!\n'));
        break;
      }

      if (lower === 'clear') {
        const newPrompt = this.buildPrompt();
        this.agent.reset(newPrompt);
        console.log(chalk.yellow('\n🔄 Conversation cleared; system prompt refreshed.\n'));
        continue;
      }

      if (lower === 'help') {
        this.showHelp();
        continue;
      }

      await this.processInput(trimmed);
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
          `\n❌ Agent failed: ${error instanceof Error ? error.message : 'Unknown error'}\nUse "clear" to reset if the issue persists.\n`,
        ),
      );
    }
  }

  private showHelp(): void {
    console.log(chalk.cyan('\n📚 Agent Help'));
    console.log(
      chalk.gray(
        'The agent reasons in gather → plan → execute → verify loops. It will call tools such as read_file, write_file, list_directory, search_text, and run_bash.',
      ),
    );
    console.log(
      chalk.gray(
        'Use natural language instructions (e.g., "Add a tool registry class", "Run npm run build"). The agent will plan tasks, run tools, and share concise final summaries.',
      ),
    );
    console.log(chalk.gray('Commands: exit | clear | help\n'));
  }
}

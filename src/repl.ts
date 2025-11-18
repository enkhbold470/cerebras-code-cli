import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import type { Message } from './types.js';
import { CerebrasClient } from './cerebras-client.js';
import { FileManager } from './file-manager.js';

export class REPL {
  private client: CerebrasClient;
  private fileManager: FileManager;
  private messages: Message[] = [];
  private systemPrompt: string;

  constructor(client: CerebrasClient, fileManager: FileManager, systemPrompt?: string) {
    this.client = client;
    this.fileManager = fileManager;
    this.systemPrompt = systemPrompt || this.getDefaultSystemPrompt();
    this.messages.push({ role: 'system', content: this.systemPrompt });
  }

  private getDefaultSystemPrompt(): string {
    return `You are an expert coding assistant powered by Cerebras ultra-fast inference. You help users with:
- Writing and reviewing code
- Debugging and fixing errors
- Explaining concepts
- Reading and analyzing project files
- Suggesting improvements

When users ask you to read files, use the format: "Read file: <path>"
When users ask you to write files, use the format: "Write file: <path>\\n<content>"

Be concise, helpful, and provide working code examples.`;
  }

  async start(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Cerebras Code CLI - Interactive Mode'));
    console.log(chalk.gray('Type "exit" or "quit" to leave, "clear" to reset conversation\n'));

    while (true) {
      const { input } = await inquirer.prompt<{ input: string }>([
        {
          type: 'input',
          name: 'input',
          message: chalk.green('You:'),
          prefix: '',
        },
      ]);

      const trimmed = input.trim().toLowerCase();

      if (trimmed === 'exit' || trimmed === 'quit') {
        console.log(chalk.cyan('\n👋 Goodbye!\n'));
        break;
      }

      if (trimmed === 'clear') {
        this.messages = [{ role: 'system', content: this.systemPrompt }];
        console.log(chalk.yellow('\n🔄 Conversation cleared\n'));
        continue;
      }

      if (trimmed === 'help') {
        this.showHelp();
        continue;
      }

      if (!input.trim()) continue;
      await this.processInput(input);
    }
  }

  private async processInput(input: string): Promise<void> {
    this.messages.push({ role: 'user', content: input });
    const spinner = ora('Thinking...').start();

    try {
      const stream = await this.client.chat(this.messages, true);
      spinner.stop();

      process.stdout.write(chalk.blue('\nAssistant: '));
      let fullResponse = '';

      for await (const chunk of stream as AsyncGenerator<string>) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }

      console.log('\n');
      this.messages.push({ role: 'assistant', content: fullResponse });
      await this.handleFileOperations(fullResponse);
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    }
  }

  private async handleFileOperations(response: string): Promise<void> {
    const readMatch = response.match(/Read file: ([^\n]+)/);
    if (readMatch) {
      const filePath = readMatch[1].trim();
      try {
        const content = await this.fileManager.readFile(filePath);
        console.log(chalk.gray(`\n📄 Contents of ${filePath}:\n${content}\n`));
      } catch {
        console.log(chalk.red(`\n❌ Could not read file: ${filePath}\n`));
      }
    }

    const writeMatch = response.match(/Write file: ([^\n]+)\n([\s\S]+)/);
    if (writeMatch) {
      const filePath = writeMatch[1].trim();
      const content = writeMatch[2].trim();
      try {
        await this.fileManager.writeFile(filePath, content);
        console.log(chalk.green(`\n✅ File written: ${filePath}\n`));
      } catch {
        console.log(chalk.red(`\n❌ Could not write file: ${filePath}\n`));
      }
    }
  }

  private showHelp(): void {
    console.log(chalk.cyan('\n📚 Available Commands:'));
    console.log(chalk.gray(' exit, quit - Exit the REPL'));
    console.log(chalk.gray(' clear - Clear conversation history'));
    console.log(chalk.gray(' help - Show this help message'));
    console.log(chalk.gray('\n💡 Tips:'));
    console.log(chalk.gray(' - Ask to read files: "read src/index.ts"'));
    console.log(chalk.gray(' - Ask to write files: "create a new component"'));
    console.log(chalk.gray(' - Ask about project: "explain this codebase"\n'));
  }
}

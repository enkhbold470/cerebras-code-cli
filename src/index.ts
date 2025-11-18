#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCerebrasConfig, loadProjectConfig } from './config.js';
import { CerebrasClient } from './cerebras-client.js';
import { FileManager } from './file-manager.js';
import { REPL } from './repl.js';
import type { Message, ProjectConfig } from './types.js';

process.env.NODE_ENV = process.env.NODE_ENV || 'debug';
const isDebug = process.env.NODE_ENV === 'debug';

interface CliOptions {
  prompt?: string;
  system?: string;
  stream?: boolean;
  listFiles?: boolean;
  structure?: boolean;
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
  .parse(process.argv);

const options = program.opts<CliOptions>();

async function main(): Promise<void> {
  try {
    const cerebrasConfig = getCerebrasConfig();
    const projectConfig = await loadProjectConfig();

    if (isDebug) {
      console.log('[debug] CLI options:', options);
      console.log('[debug] Project config:', projectConfig);
      console.log('[debug] Cerebras config:', {
        ...cerebrasConfig,
        apiKey: '***redacted***',
      });
    }

    const client = new CerebrasClient(cerebrasConfig);
    const fileManager = new FileManager(process.cwd(), projectConfig.excludedPaths);

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

    if (options.prompt) {
      await handlePromptMode(client, options, projectConfig);
      return;
    }

    const systemPrompt = options.system || projectConfig.instructions;
    const repl = new REPL(client, fileManager, systemPrompt);
    await repl.start();
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    if (isDebug && error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

async function handlePromptMode(
  client: CerebrasClient,
  options: CliOptions,
  projectConfig: ProjectConfig,
): Promise<void> {
  const messages: Message[] = [];
  const systemPrompt = options.system || projectConfig.instructions || 'You are a helpful coding assistant.';
  messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: options.prompt ?? '' });

  const spinner = ora('Processing...').start();

  try {
    if (options.stream ?? true) {
      const stream = await client.chat(messages, true);
      spinner.stop();
      process.stdout.write(chalk.blue('\n'));
      for await (const chunk of stream as AsyncGenerator<string>) {
        process.stdout.write(chunk);
      }
      console.log('\n');
    } else {
      const response = (await client.chat(messages, false)) as string;
      spinner.stop();
      console.log(chalk.blue(`\n${response}\n`));
    }
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

await main();

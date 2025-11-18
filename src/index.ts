#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCerebrasConfig, loadProjectConfig } from './config.js';
import { CerebrasClient } from './cerebras-client.js';
import { FileManager } from './file-manager.js';
import { REPL } from './repl.js';
import { ToolRegistry } from './tools/registry.js';
import { toolDefinitions } from './tools/definitions.js';
import { AgenticLoop, buildSystemPrompt } from './agent/loop.js';

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
    const toolRegistry = new ToolRegistry(toolDefinitions, {
      fileManager,
      projectRoot: process.cwd(),
    });

    const systemPromptBuilder = () => buildSystemPrompt(toolRegistry, projectConfig, options.system);
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

    if (options.prompt) {
      await handlePromptMode(agent, options.prompt, systemPromptBuilder());
      return;
    }

    const repl = new REPL(agent, systemPromptBuilder);
    await repl.start();
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
    if (isDebug && error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

async function handlePromptMode(agent: AgenticLoop, prompt: string, systemPrompt: string): Promise<void> {
  try {
    const response = await agent.run(prompt, { systemPrompt, stream: false });
    console.log(chalk.blueBright(`\n${response}\n`));
  } catch (error) {
    throw error instanceof Error ? error : new Error('Prompt mode failed');
  }
}

await main();

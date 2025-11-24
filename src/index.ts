#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getCerebrasConfig, loadProjectConfig, getModelConfig } from './config.js';
import { CerebrasClient } from './cerebras-client.js';
import { FileManager } from './file-manager.js';
import { REPL } from './repl.js';
import { ToolRegistry } from './tools/registry.js';
import { toolDefinitions } from './tools/definitions.js';
import { AgenticLoop, buildSystemPrompt } from './agent/loop.js';
import { SessionState } from './session/state.js';
import { SessionTracker } from './session/tracker.js';
import { SlashCommandLoader } from './commands/slash-commands.js';
import { CommandRegistry } from './commands/registry.js';
import { QuotaTracker } from './quota-tracker.js';

process.env.NODE_ENV = process.env.NODE_ENV || 'false';
const isDebug = process.env.NODE_ENV === 'false';

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

async function main(): Promise<void> {
  try {
    // Handle list-models option first
    if (options.listModels) {
      const { listAvailableModels } = await import('./config.js');
      const models = listAvailableModels();
      console.log(chalk.cyan('\nAvailable Models:\n'));
      for (const modelName of models) {
        const config = getModelConfig(modelName);
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

    const cerebrasConfig = getCerebrasConfig(options.model);
    const projectConfig = await loadProjectConfig();
    const modelConfig = getModelConfig(cerebrasConfig.model);

    if (isDebug) {
      console.log('[debug] CLI options:', options);
      console.log('[debug] Project config:', projectConfig);
      console.log('[debug] Cerebras config:', {
        ...cerebrasConfig,
        apiKey: '***redacted***',
      });
      if (modelConfig) {
        console.log('[debug] Model config:', modelConfig);
      }
    }

    const tracker = new SessionTracker();
    const quotaTracker = modelConfig ? new QuotaTracker(modelConfig) : undefined;
    const client = new CerebrasClient(cerebrasConfig, tracker, quotaTracker);
    const sessionState = new SessionState(cerebrasConfig.model, options.system);
    
    // Set permission mode based on CLI options
    if (options.yolo || options['dangerously-skip-permissions']) {
      sessionState.setPermissionMode('yolo');
    } else if (options.prompt) {
      sessionState.setPermissionMode('auto-accept');
    }
    
    const fileManager = new FileManager(process.cwd(), projectConfig.excludedPaths);
    const toolRegistry = new ToolRegistry(
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

    // Initialize command registry
    const commandLoader = new SlashCommandLoader();
    const commandRegistry = new CommandRegistry(commandLoader);
    await commandRegistry.load();

    if (options.prompt) {
      await handlePromptMode(agent, options.prompt, systemPromptBuilder(), tracker, sessionState);
      return;
    }

    const repl = new REPL(agent, systemPromptBuilder, sessionState, tracker, client, quotaTracker, commandRegistry);
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

// Handle top-level await properly
try {
  await main();
} catch (error) {
  console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
  if (process.env.NODE_ENV === 'debug' && error instanceof Error && error.stack) {
    console.error(chalk.gray(error.stack));
  }
  process.exit(1);
}

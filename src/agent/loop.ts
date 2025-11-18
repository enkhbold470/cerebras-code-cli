import chalk from 'chalk';
import ora from 'ora';
import type { CerebrasClient } from '../cerebras-client.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Message } from '../types.js';
import { parseAssistantResponse } from './parser.js';
import { buildSystemPrompt } from './system-prompt.js';

interface AgentLoopOptions {
  maxIterations?: number;
  stream?: boolean;
  systemPrompt?: string;
}

export class AgenticLoop {
  private messages: Message[] = [];
  private readonly client: CerebrasClient;
  private readonly tools: ToolRegistry;
  private readonly maxIterations: number;
  private currentSystemPrompt: string;

  constructor(
    client: CerebrasClient,
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

  async run(userPrompt: string, options?: AgentLoopOptions): Promise<string> {
    if (options?.systemPrompt) {
      this.reset(options.systemPrompt);
    }
    this.messages.push({ role: 'user', content: userPrompt });
    const spinner = ora('Agent thinking...').start();

    try {
      let iteration = 0;
      let lastResponse = '';

      while (iteration++ < this.maxIterations) {
        const response = (await this.client.chat(this.messages, options?.stream ?? false)) as string;
        lastResponse = response;
        const parsed = parseAssistantResponse(response);

        if (!parsed) {
          spinner.stop();
          this.messages.push({ role: 'assistant', content: response });
          return response.trim();
        }

        if (parsed.type === 'final') {
          spinner.stop();
          this.messages.push({ role: 'assistant', content: parsed.message });
          return parsed.message.trim();
        }

        if (parsed.type === 'tool_calls') {
          spinner.text = `Running ${parsed.calls.length} tool${parsed.calls.length > 1 ? 's' : ''}...`;
          this.messages.push({ role: 'assistant', content: lastResponse });
          for (const call of parsed.calls) {
            try {
              const result = await this.tools.execute(call);
              const toolResultMessage = [
                `TOOL_RESULT ${call.id}`,
                `name: ${call.name}`,
                'output:',
                result,
              ].join('\n');
              this.messages.push({ role: 'user', content: toolResultMessage });
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Unknown tool error';
              this.messages.push({
                role: 'user',
                content: `TOOL_RESULT ${call.id}\nname: ${call.name}\nerror: ${errorMessage}`,
              });
            }
          }
          spinner.text = 'Agent thinking...';
          continue;
        }
      }

      spinner.stop();
      throw new Error('Exceeded maximum tool iterations.');
    } catch (error) {
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

export { buildSystemPrompt };

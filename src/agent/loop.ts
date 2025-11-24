import chalk from 'chalk';
import ora from 'ora';
import type { LLMProvider } from '../providers/base.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Message } from '../types.js';
import { parseAssistantResponse } from './parser.js';
import { buildSystemPrompt } from './system-prompt.js';
import { debugLog, debugError } from '../utils/debug.js';

interface AgentLoopOptions {
  maxIterations?: number;
  stream?: boolean;
  systemPrompt?: string;
}

export class AgenticLoop {
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

  /**
   * Update system prompt without clearing conversation history
   * Only updates the system message if it exists, otherwise adds it
   */
  updateSystemPrompt(systemPrompt: string): void {
    this.currentSystemPrompt = systemPrompt;
    const systemIndex = this.messages.findIndex(msg => msg.role === 'system');
    if (systemIndex !== -1) {
      // Update existing system message
      this.messages[systemIndex] = { role: 'system', content: systemPrompt };
    } else {
      // Add system message at the beginning if it doesn't exist
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
    debugLog('Last few messages:', this.messages.slice(-3).map(m => `${m.role}: ${m.content.substring(0, 50)}...`));
    const spinner = ora('Agent thinking...').start();
    debugLog('Spinner started');

    try {
      let iteration = 0;
      let lastResponse = '';

      while (iteration++ < this.maxIterations) {
        debugLog('Agent loop iteration:', iteration);
        debugLog('Calling client.chat with', this.messages.length, 'messages in history');
        debugLog('Message roles:', this.messages.map(m => m.role).join(', '));
        debugLog('Last user message preview:', this.messages.filter(m => m.role === 'user').slice(-1)[0]?.content.substring(0, 100));
        const response = (await this.client.chat(this.messages, options?.stream ?? false)) as string;
        debugLog('client.chat completed, response length:', response.length);
        lastResponse = response;
        debugLog('Parsing response...');
        const parsed = parseAssistantResponse(response);
        debugLog('Parsed result:', parsed ? `type=${parsed.type}` : 'null');

        if (!parsed) {
          debugLog('No parse result, returning raw response');
          debugLog('Response preview:', response.substring(0, 200));
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
          // Add the assistant's response (with tool calls) to history
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
          debugLog('Last few messages:', this.messages.slice(-5).map(m => `${m.role}: ${m.content.substring(0, 80)}...`));
          
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

export { buildSystemPrompt };

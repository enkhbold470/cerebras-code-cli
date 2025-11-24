import type {
  Message,
  CerebrasConfig,
  ChatCompletionResponse,
  StreamChunk,
} from './types.js';
import type { SessionTracker } from './session/tracker.js';
import { QuotaTracker } from './quota-tracker.js';
import { getModelConfig } from './models.js';

export class CerebrasClient {
  private config: CerebrasConfig;
  private debug: boolean;
  private tracker?: SessionTracker;
  private quotaTracker?: QuotaTracker;

  constructor(config: CerebrasConfig, tracker?: SessionTracker, quotaTracker?: QuotaTracker) {
    this.config = config;
    this.debug = process.env.NODE_ENV === 'debug';
    this.tracker = tracker;
    this.quotaTracker = quotaTracker;
  }

  /**
   * Estimate token count for messages (rough approximation: ~4 chars per token)
   */
  private estimateTokens(messages: Message[], maxTokens?: number): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const estimatedInputTokens = Math.ceil(totalChars / 4);
    const estimatedOutputTokens = maxTokens || this.config.maxTokens || 4096;
    return estimatedInputTokens + estimatedOutputTokens;
  }

  async chat(messages: Message[], stream = false): Promise<string | AsyncGenerator<string>> {
    // Estimate tokens and check quota before making request
    const estimatedTokens = this.estimateTokens(messages, this.config.maxTokens);
    
    if (this.quotaTracker) {
      const quotaCheck = this.quotaTracker.canMakeRequest(estimatedTokens);
      if (!quotaCheck.canProceed) {
        throw new Error(`Quota limit exceeded: ${quotaCheck.error}`);
      }
    }

    const url = `${this.config.baseUrl}/chat/completions`;
    const body = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream,
    };

    if (this.debug) {
      console.log('[cerebras-client] POST', url);
      console.log('[cerebras-client] Estimated tokens:', estimatedTokens);
    }

    const requestStart = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const durationMs = Date.now() - requestStart;
    this.tracker?.recordApiCall(durationMs);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cerebras API error: ${error}`);
    }

    if (stream) {
      return this.handleStream(response, estimatedTokens);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices[0]?.message?.content ?? '';
    
    // Record quota usage after successful request
    // Estimate actual tokens used (input + output)
    const actualTokens = this.estimateTokens(messages, this.config.maxTokens) + 
                         Math.ceil(content.length / 4);
    this.quotaTracker?.recordRequest(actualTokens);

    return content;
  }

  private async *handleStream(response: Response, estimatedTokens: number): AsyncGenerator<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let totalContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') {
            // Record quota usage after stream completes
            const actualTokens = estimatedTokens + Math.ceil(totalContent.length / 4);
            this.quotaTracker?.recordRequest(actualTokens);
            return;
          }

          try {
            const parsed = JSON.parse(data) as StreamChunk;
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              totalContent += content;
              yield content;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
      
      // Record quota usage if stream ends without [DONE]
      const actualTokens = estimatedTokens + Math.ceil(totalContent.length / 4);
      this.quotaTracker?.recordRequest(actualTokens);
    } finally {
      reader.releaseLock();
    }
  }
}

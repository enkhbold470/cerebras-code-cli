import type {
  Message,
  CerebrasConfig,
  ChatCompletionResponse,
  StreamChunk,
} from './types.js';

export class CerebrasClient {
  private config: CerebrasConfig;
  private debug: boolean;

  constructor(config: CerebrasConfig) {
    this.config = config;
    this.debug = process.env.NODE_ENV === 'debug';
  }

  async chat(messages: Message[], stream = false): Promise<string | AsyncGenerator<string>> {
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
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cerebras API error: ${error}`);
    }

    if (stream) {
      return this.handleStream(response);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return data.choices[0]?.message?.content ?? '';
  }

  private async *handleStream(response: Response): AsyncGenerator<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

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
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data) as StreamChunk;
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

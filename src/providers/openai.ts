import type { Message, ChatCompletionResponse, StreamChunk } from '../types.js';
import type { LLMProvider } from './base.js';
import { debugLog } from '../utils/debug.js';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export class OpenAIProvider implements LLMProvider {
  private config: OpenAIConfig;
  private debug: boolean;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.debug = process.env.NODE_ENV === 'debug';
  }

  estimateTokens(messages: Message[], maxTokens?: number): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const estimatedInputTokens = Math.ceil(totalChars / 4);
    const estimatedOutputTokens = maxTokens || this.config.maxTokens || 4096;
    return estimatedInputTokens + estimatedOutputTokens;
  }

  async chat(messages: Message[], stream = false): Promise<string | AsyncGenerator<string>> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl}/chat/completions`;
    
    const body = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature || 0.7,
      stream,
    };

    const estimatedTokens = this.estimateTokens(messages, this.config.maxTokens);
    
    if (this.debug) {
      debugLog('[openai-client] POST', url);
      debugLog('[openai-client] Model:', this.config.model);
      debugLog('[openai-client] Estimated tokens:', estimatedTokens);
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
      throw new Error(`OpenAI API error: ${error}`);
    }

    if (stream) {
      return this.handleStream(response);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices[0]?.message?.content ?? '';
    return content;
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
          if (data === '[DONE]') {
            return;
          }

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


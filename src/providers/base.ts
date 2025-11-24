import type { Message } from '../types.js';

export interface LLMProvider {
  chat(messages: Message[], stream?: boolean): Promise<string | AsyncGenerator<string>>;
  estimateTokens(messages: Message[], maxTokens?: number): number;
}

export type ProviderType = 'cerebras' | 'openai' | 'anthropic';


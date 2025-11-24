import { describe, it, expect } from 'vitest';
import type { LLMProvider, ProviderType } from '../../src/providers/base.js';

describe('Provider Types', () => {
  it('should export ProviderType', () => {
    const types: ProviderType[] = ['cerebras', 'openai', 'anthropic'];
    expect(types).toContain('cerebras');
    expect(types).toContain('openai');
    expect(types).toContain('anthropic');
  });

  it('should export LLMProvider interface', () => {
    // Type check - if this compiles, the interface is properly exported
    const provider: LLMProvider = {
      chat: async () => '',
      estimateTokens: () => 0,
    };
    expect(provider).toBeDefined();
  });
});


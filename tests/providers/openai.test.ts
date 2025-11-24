import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OpenAIProvider } from '../../src/providers/openai.js';
import type { Message } from '../../src/types.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('OpenAIProvider', () => {
  const mockConfig = {
    apiKey: 'test-openai-key',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    temperature: 0.7,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with config', () => {
      const provider = new OpenAIProvider(mockConfig);
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly', () => {
      const provider = new OpenAIProvider(mockConfig);
      const messages: Message[] = [
        { role: 'user', content: 'Hello, world!' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const tokens = provider.estimateTokens(messages);
      expect(typeof tokens).toBe('number');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should include maxTokens in estimate', () => {
      const provider = new OpenAIProvider({ ...mockConfig, maxTokens: 2048 });
      const messages: Message[] = [{ role: 'user', content: 'Test' }];

      const tokens = provider.estimateTokens(messages, 1024);
      expect(tokens).toBeGreaterThan(1024);
    });
  });

  describe('chat', () => {
    it('should make API call with correct parameters', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }],
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(mockConfig);
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      const result = await provider.chat(messages);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-openai-key',
          }),
          body: expect.stringContaining('gpt-4o-mini'),
        }),
      );

      expect(result).toBe('Test response');
    });

    it('should use custom base URL if provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test' } }],
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider({
        ...mockConfig,
        baseUrl: 'https://custom.openai.com/v1',
      });
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      await provider.chat(messages);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.openai.com/v1/chat/completions',
        expect.any(Object),
      );
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        text: vi.fn().mockResolvedValue('API Error'),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(mockConfig);
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      await expect(provider.chat(messages)).rejects.toThrow('OpenAI API error');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: {} }],
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider(mockConfig);
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      const result = await provider.chat(messages);
      expect(result).toBe('');
    });
  });
});


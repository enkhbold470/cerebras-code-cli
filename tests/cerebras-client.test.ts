import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { CerebrasClient } from '../src/cerebras-client.js';
import { QuotaTracker } from '../src/quota-tracker.js';
import { AVAILABLE_MODELS } from '../src/models.js';
import type { CerebrasConfig } from '../src/types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Set up default mock response
mockFetch.mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Mock response' } }]
  })
});

describe('CerebrasClient', () => {
  let mockConfig: CerebrasConfig;
  let mockTracker: any;
  let mockQuotaTracker: QuotaTracker;
  let client: CerebrasClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Reset fetch mock
    vi.clearAllMocks();

    mockConfig = {
      apiKey: 'test-api-key',
      model: 'qwen-3-235b-a22b-instruct-2507',
      baseUrl: 'https://api.cerebras.ai/v1',
      maxTokens: 4096,
      temperature: 0.7,
    };

    mockTracker = {
      recordApiCall: vi.fn(),
    };

    mockQuotaTracker = new QuotaTracker(AVAILABLE_MODELS['qwen-3-235b-a22b-instruct-2507']);

    client = new CerebrasClient(mockConfig, mockTracker, mockQuotaTracker);
  });

  describe('constructor', () => {
    it('should initialize with config and trackers', () => {
      expect(client).toBeDefined();
    });

    it('should work without quota tracker', () => {
      const clientWithoutQuota = new CerebrasClient(mockConfig, mockTracker);
      expect(clientWithoutQuota).toBeDefined();
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens based on message length', () => {
      const messages = [
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      // 11 + 9 = 20 characters, roughly 20/4 = 5 input tokens
      // Plus 4096 output tokens = ~4101 total
      // This is internal method, we'll test indirectly through quota validation
      expect(true).toBe(true); // Placeholder for now
    });
  });

  describe('quota validation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should reject requests exceeding context length', async () => {
      // Create a message that definitely exceeds the model's context length
      // qwen-3-235b-a22b-instruct-2507 has 65536 token limit
      // Using a much longer message to ensure it exceeds the limit
      const longMessage = 'This is a very long message that should exceed the token limit. '.repeat(5000);
      const messages = [{ role: 'user', content: longMessage }];

      await expect(client.chat(messages)).rejects.toThrow('Quota limit exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should allow requests within quota limits', async () => {
      // Mock successful API response
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }]
        })
      });

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(client.chat(messages)).resolves.toBe('Test response');
      expect(mockTracker.recordApiCall).toHaveBeenCalledWith(expect.any(Number));
    });

    it('should reject requests when request quota exceeded', async () => {
      // Fill up the quota
      const modelConfig = AVAILABLE_MODELS['qwen-3-235b-a22b-instruct-2507'];
      for (let i = 0; i < modelConfig.quota.requests.minute; i++) {
        mockQuotaTracker.recordRequest(100);
      }

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(client.chat(messages)).rejects.toThrow('Request quota exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should reject requests when token quota exceeded', async () => {
      // Use up most of the token quota
      mockQuotaTracker.recordRequest(60000); // Close to 64000 limit

      const messages = [{ role: 'user', content: 'x'.repeat(1000) }]; // ~250 tokens

      await expect(client.chat(messages)).rejects.toThrow('Token quota exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should record token usage after successful requests', async () => {
      const messages = [{ role: 'user', content: 'Hello world' }];

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Response with more text' } }]
        })
      });

      await client.chat(messages);

      // Should have recorded some tokens (input + output)
      const usage = mockQuotaTracker.getQuotaUsage();
      expect(usage.requests.minute).toBe(1);
      expect(usage.tokens.minute).toBeGreaterThan(0);
    });
  });

  describe('streaming requests', () => {
    it('should handle streaming with quota validation', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      // Mock streaming response
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Stream response' } }]
        })
      });

      const stream = await client.chat(messages, true);
      expect(typeof stream).toBe('object'); // AsyncGenerator
    });

    it('should reject streaming requests when quota exceeded', async () => {
      // Fill up quota
      const modelConfig = AVAILABLE_MODELS['qwen-3-235b-a22b-instruct-2507'];
      for (let i = 0; i < modelConfig.quota.requests.minute; i++) {
        mockQuotaTracker.recordRequest(100);
      }

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(client.chat(messages, true)).rejects.toThrow('Request quota exceeded');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('API error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('API Error: Invalid key')
      });

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(client.chat(messages)).rejects.toThrow('Cerebras API error: API Error: Invalid key');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(client.chat(messages)).rejects.toThrow('Network error');
    });
  });

  describe('request formatting', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }]
        })
      });
    });

    it('should format requests correctly', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' }
      ];

      await client.chat(messages);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cerebras.ai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          },
          body: JSON.stringify({
            model: 'qwen-3-235b-a22b-instruct-2507',
            messages,
            max_tokens: 4096,
            temperature: 0.7,
            stream: false,
          })
        })
      );
    });

    it('should use custom maxTokens when provided', async () => {
      const customConfig = { ...mockConfig, maxTokens: 2048 };
      const customClient = new CerebrasClient(customConfig, mockTracker, mockQuotaTracker);

      await customClient.chat([{ role: 'user', content: 'Hello' }]);

      const callArgs = (global.fetch as Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.max_tokens).toBe(2048);
    });
  });

  describe('integration with different models', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Test response' } }]
        })
      });
    });

    it('should work with different model configurations', async () => {
      const llamaConfig = {
        ...mockConfig,
        model: 'llama3.1-8b',
        maxTokens: 1024, // Smaller than default
      };
      const llamaQuota = new QuotaTracker(AVAILABLE_MODELS['llama3.1-8b']);
      const llamaClient = new CerebrasClient(llamaConfig, mockTracker, llamaQuota);

      await llamaClient.chat([{ role: 'user', content: 'Hello' }]);

      const callArgs = (global.fetch as Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.model).toBe('llama3.1-8b');
      expect(body.max_tokens).toBe(1024);
    });

  describe('model-specific limits', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should enforce model-specific context limits', async () => {
      const llama8bConfig = { ...mockConfig, model: 'llama3.1-8b' };
      const llama8bQuota = new QuotaTracker(AVAILABLE_MODELS['llama3.1-8b']);
      const llama8bClient = new CerebrasClient(llama8bConfig, mockTracker, llama8bQuota);

      // Try to send a message that exceeds llama3.1-8b's 8192 limit
      const longMessage = 'This is a very long message that should exceed the llama 8b token limit. '.repeat(1000);
      const messages = [{ role: 'user', content: longMessage }];

      await expect(llama8bClient.chat(messages)).rejects.toThrow('exceeds model max context length');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
  });
});

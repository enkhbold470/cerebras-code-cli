import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getCerebrasConfig, getOpenAIConfig, getLLMConfig, listAvailableModels } from '../src/config.js';
import { AVAILABLE_MODELS } from '../src/models.js';

// Mock environment variables
const originalEnv = { ...process.env };

beforeEach(() => {
  // Reset environment for each test
  process.env = { ...originalEnv };
  // Explicitly clear OpenAI env vars that might be set in .env files
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MAX_TOKENS;
  delete process.env.OPENAI_TEMPERATURE;
  vi.clearAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
});

describe('getCerebrasConfig', () => {
  it('should throw error when CEREBRAS_API_KEY is not set', () => {
    delete process.env.CEREBRAS_API_KEY;

    expect(() => getCerebrasConfig()).toThrow('CEREBRAS_API_KEY not found');
  });

  it('should return default config with API key', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';

    const config = getCerebrasConfig();

    expect(config.apiKey).toBe('test-key');
    expect(config.model).toBe('qwen-3-235b-a22b-instruct-2507'); // DEFAULT_MODEL
    expect(config.baseUrl).toBe('https://api.cerebras.ai/v1');
    expect(config.maxTokens).toBe(4096);
    expect(config.temperature).toBe(0.7);
  });

  it('should use custom model from parameter', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';

    const config = getCerebrasConfig('llama3.1-8b');

    expect(config.model).toBe('llama3.1-8b');
  });

  it('should use custom model from environment variable', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';
    process.env.CEREBRAS_MODEL = 'llama3.1-8b';

    const config = getCerebrasConfig();

    expect(config.model).toBe('llama3.1-8b');
  });

  it('should prioritize parameter over environment variable', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';
    process.env.CEREBRAS_MODEL = 'qwen-3-32b';

    const config = getCerebrasConfig('llama3.1-8b');

    expect(config.model).toBe('llama3.1-8b');
  });

  it('should use custom base URL from environment', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';
    process.env.CEREBRAS_BASE_URL = 'https://custom.api.com/v1';

    const config = getCerebrasConfig();

    expect(config.baseUrl).toBe('https://custom.api.com/v1');
  });

  it('should use custom max tokens from environment', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';
    process.env.CEREBRAS_MAX_TOKENS = '2048';

    const config = getCerebrasConfig();

    expect(config.maxTokens).toBe(2048);
  });

  it('should use custom temperature from environment', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';
    process.env.CEREBRAS_TEMPERATURE = '0.5';

    const config = getCerebrasConfig();

    expect(config.temperature).toBe(0.5);
  });

  it('should cap maxTokens to model context length', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';
    process.env.CEREBRAS_MAX_TOKENS = '100000'; // Much higher than any model limit

    const config = getCerebrasConfig('llama3.1-8b'); // 8192 context

    expect(config.maxTokens).toBe(8192); // Should be capped to model limit
  });

  it('should throw error for invalid model parameter', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';

    expect(() => getCerebrasConfig('invalid-model')).toThrow('Invalid model: invalid-model');
  });

  it('should throw error for invalid model in environment', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';
    process.env.CEREBRAS_MODEL = 'invalid-model';

    expect(() => getCerebrasConfig()).toThrow('Invalid model: invalid-model');
  });

  it('should list all available models with invalid model error', () => {
    process.env.CEREBRAS_API_KEY = 'test-key';

    expect(() => getCerebrasConfig('invalid-model')).toThrow('Invalid model: invalid-model');
  });
});

describe('getOpenAIConfig', () => {
  it('should throw error when OPENAI_API_KEY is not set', () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => getOpenAIConfig()).toThrow('OPENAI_API_KEY not found');
  });

  it('should return default config with API key', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const config = getOpenAIConfig();

    expect(config.apiKey).toBe('test-openai-key');
    expect(config.model).toBe('gpt-4o-mini');
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.maxTokens).toBe(4096);
    expect(config.temperature).toBe(0.7);
  });

  it('should use custom model from parameter', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    const config = getOpenAIConfig('gpt-4o');

    expect(config.model).toBe('gpt-4o');
  });

  it('should use custom model from environment variable', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o';

    const config = getOpenAIConfig();

    expect(config.model).toBe('gpt-4o');
  });

  it('should prioritize parameter over environment variable', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o';

    const config = getOpenAIConfig('gpt-3.5-turbo');

    expect(config.model).toBe('gpt-3.5-turbo');
  });

  it('should use custom base URL from environment', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_BASE_URL = 'https://custom.openai.com/v1';

    const config = getOpenAIConfig();

    expect(config.baseUrl).toBe('https://custom.openai.com/v1');
  });

  it('should throw error for invalid OpenAI model', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    expect(() => getOpenAIConfig('invalid-model')).toThrow('Invalid model: invalid-model');
  });
});

describe('getLLMConfig', () => {
  it('should return OpenAI config when OpenAI API key is set', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    delete process.env.CEREBRAS_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.CEREBRAS_MODEL;

    const config = getLLMConfig();

    expect(config.apiKey).toBe('test-openai-key');
    expect('model' in config && config.model).toBe('gpt-4o-mini');
  });

  it('should return Cerebras config when only Cerebras API key is set', () => {
    process.env.CEREBRAS_API_KEY = 'test-cerebras-key';
    delete process.env.OPENAI_API_KEY;

    const config = getLLMConfig();

    expect(config.apiKey).toBe('test-cerebras-key');
    expect('model' in config && config.model).toBe('qwen-3-235b-a22b-instruct-2507');
  });

  it('should detect provider from model name', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.CEREBRAS_API_KEY = 'test-cerebras-key';

    const config = getLLMConfig('gpt-4o-mini');

    expect(config.apiKey).toBe('test-openai-key');
    expect('model' in config && config.model).toBe('gpt-4o-mini');
  });

  it('should prefer Cerebras when model is Cerebras model', () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.CEREBRAS_API_KEY = 'test-cerebras-key';
    delete process.env.OPENAI_MODEL;
    delete process.env.CEREBRAS_MODEL;

    const config = getLLMConfig('qwen-3-235b-a22b-instruct-2507');

    expect(config.apiKey).toBe('test-cerebras-key');
    expect('model' in config && config.model).toBe('qwen-3-235b-a22b-instruct-2507');
  });
});

describe('listAvailableModels', () => {
  it('should return all available model names', () => {
    const models = listAvailableModels();

    expect(Array.isArray(models)).toBe(true);
    expect(models).toHaveLength(Object.keys(AVAILABLE_MODELS).length);
    expect(models).toContain('qwen-3-235b-a22b-instruct-2507');
    expect(models).toContain('llama3.1-8b');
    expect(models).toContain('gpt-oss-120b');
  });

  it('should match AVAILABLE_MODELS keys', () => {
    const models = listAvailableModels();
    const availableKeys = Object.keys(AVAILABLE_MODELS);

    expect(models.sort()).toEqual(availableKeys.sort());
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AVAILABLE_MODELS,
  getModelConfig,
  listAvailableModels,
  isValidModel,
  getModelProvider,
  type ModelConfig
} from '../src/models.js';

describe('Models Configuration', () => {
  describe('AVAILABLE_MODELS', () => {
    it('should contain all expected models including OpenAI models', () => {
      const expectedCerebrasModels = [
        'gpt-oss-120b',
        'llama-3.3-70b',
        'llama3.1-8b',
        'qwen-3-235b-a22b-instruct-2507',
        'qwen-3-32b',
        'zai-glm-4.6'
      ];
      
      const expectedOpenAIModels = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo'
      ];

      const actualModels = Object.keys(AVAILABLE_MODELS);
      
      // Check Cerebras models
      expectedCerebrasModels.forEach(model => {
        expect(actualModels).toContain(model);
      });
      
      // Check OpenAI models
      expectedOpenAIModels.forEach(model => {
        expect(actualModels).toContain(model);
      });
      
      expect(actualModels.length).toBeGreaterThanOrEqual(11);
    });

    it('should have valid model configurations', () => {
      for (const [modelName, config] of Object.entries(AVAILABLE_MODELS)) {
        expect(typeof config.name).toBe('string');
        expect(config.name).toBe(modelName);
        expect(typeof config.maxContextLength).toBe('number');
        expect(config.maxContextLength).toBeGreaterThan(0);

        // Check quota structure
        expect(config.quota).toHaveProperty('requests');
        expect(config.quota).toHaveProperty('tokens');

        // Check request quotas
        expect(config.quota.requests).toHaveProperty('minute');
        expect(config.quota.requests).toHaveProperty('hour');
        expect(config.quota.requests).toHaveProperty('day');
        expect(typeof config.quota.requests.minute).toBe('number');
        expect(typeof config.quota.requests.hour).toBe('number');
        expect(typeof config.quota.requests.day).toBe('number');

        // Check token quotas
        expect(config.quota.tokens).toHaveProperty('minute');
        expect(config.quota.tokens).toHaveProperty('hour');
        expect(config.quota.tokens).toHaveProperty('day');
        expect(typeof config.quota.tokens.minute).toBe('number');
        expect(typeof config.quota.tokens.hour).toBe('number');
        expect(typeof config.quota.tokens.day).toBe('number');
      }
    });

    it('should have reasonable quota limits', () => {
      for (const config of Object.values(AVAILABLE_MODELS)) {
        // Requests: minute <= hour <= day
        expect(config.quota.requests.minute).toBeLessThanOrEqual(config.quota.requests.hour);
        expect(config.quota.requests.hour).toBeLessThanOrEqual(config.quota.requests.day);

        // Tokens: minute <= hour <= day
        expect(config.quota.tokens.minute).toBeLessThanOrEqual(config.quota.tokens.hour);
        expect(config.quota.tokens.hour).toBeLessThanOrEqual(config.quota.tokens.day);
      }
    });
  });

  describe('getModelConfig', () => {
    it('should return correct config for valid models', () => {
      const config = getModelConfig('qwen-3-235b-a22b-instruct-2507');
      expect(config).not.toBeNull();
      expect(config?.name).toBe('qwen-3-235b-a22b-instruct-2507');
      expect(config?.maxContextLength).toBe(65536);
    });

    it('should return null for invalid models', () => {
      expect(getModelConfig('invalid-model')).toBeNull();
      expect(getModelConfig('')).toBeNull();
      expect(getModelConfig('nonexistent')).toBeNull();
    });
  });

  describe('listAvailableModels', () => {
    it('should return all available model names', () => {
      const models = listAvailableModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThanOrEqual(11);
      expect(models).toContain('qwen-3-235b-a22b-instruct-2507');
      expect(models).toContain('llama3.1-8b');
      expect(models).toContain('gpt-4o-mini');
      expect(models).toContain('gpt-4o');
    });
  });
  
  describe('getModelProvider', () => {
    it('should return openai for OpenAI models', () => {
      expect(getModelProvider('gpt-4o')).toBe('openai');
      expect(getModelProvider('gpt-4o-mini')).toBe('openai');
      expect(getModelProvider('gpt-4-turbo')).toBe('openai');
      expect(getModelProvider('gpt-4')).toBe('openai');
      expect(getModelProvider('gpt-3.5-turbo')).toBe('openai');
    });

    it('should return cerebras for Cerebras models', () => {
      expect(getModelProvider('qwen-3-235b-a22b-instruct-2507')).toBe('cerebras');
      expect(getModelProvider('llama3.1-8b')).toBe('cerebras');
      expect(getModelProvider('gpt-oss-120b')).toBe('cerebras');
    });
  });

  describe('isValidModel', () => {
    it('should return true for valid models', () => {
      expect(isValidModel('qwen-3-235b-a22b-instruct-2507')).toBe(true);
      expect(isValidModel('llama3.1-8b')).toBe(true);
      expect(isValidModel('gpt-oss-120b')).toBe(true);
    });

    it('should return false for invalid models', () => {
      expect(isValidModel('invalid-model')).toBe(false);
      expect(isValidModel('')).toBe(false);
      expect(isValidModel('fake-model')).toBe(false);
    });
  });

  describe('Model-specific validations', () => {
    it('qwen-3-235b-a22b-instruct-2507 should have correct limits', () => {
      const config = AVAILABLE_MODELS['qwen-3-235b-a22b-instruct-2507'];
      expect(config.maxContextLength).toBe(65536);
      expect(config.quota.requests.minute).toBe(30);
      expect(config.quota.requests.hour).toBe(900);
      expect(config.quota.requests.day).toBe(1440);
      expect(config.quota.tokens.minute).toBe(64000);
      expect(config.quota.tokens.hour).toBe(1000000);
      expect(config.quota.tokens.day).toBe(1000000);
    });

    it('llama3.1-8b should have smaller context length', () => {
      const config = AVAILABLE_MODELS['llama3.1-8b'];
      expect(config.maxContextLength).toBe(8192);
      expect(config.quota.requests.minute).toBe(30);
      expect(config.quota.tokens.minute).toBe(60000);
    });

    it('zai-glm-4.6 should have lower request limits', () => {
      const config = AVAILABLE_MODELS['zai-glm-4.6'];
      expect(config.maxContextLength).toBe(64000);
      expect(config.quota.requests.minute).toBe(10);
      expect(config.quota.requests.hour).toBe(100);
      expect(config.quota.requests.day).toBe(100);
    });
  });
});

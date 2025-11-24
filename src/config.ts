import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import type { CerebrasConfig, ProjectConfig } from './types.js';
import { ContextLoader } from './config/context-loader.js';
import { AVAILABLE_MODELS, isValidModel, getModelProvider, type ModelConfig } from './models.js';
import type { OpenAIConfig } from './providers/openai.js';

dotenv.config({ path: ['.env.local', '.env'] });

const DEFAULT_MODEL = 'qwen-3-235b-a22b-instruct-2507';

export async function loadProjectConfig(): Promise<ProjectConfig> {
  const configPath = join(process.cwd(), '.cerebrasrc');
  const config: ProjectConfig = {};

  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      Object.assign(config, JSON.parse(content));
    } catch (error) {
      console.warn('Warning: Could not parse .cerebrasrc');
    }
  }

  // Load hierarchical context files (AGENTS.md, CLAUDE.md)
  const contextLoader = new ContextLoader(process.cwd());
  const contextContent = await contextLoader.mergeContext();
  
  if (contextContent) {
    // Merge with existing instructions if any
    config.instructions = config.instructions
      ? `${config.instructions}\n\n${contextContent}`
      : contextContent;
  }

  return config;
}

export { ContextLoader };

export function getCerebrasConfig(modelOverride?: string): CerebrasConfig {
  const apiKey = process.env.CEREBRAS_API_KEY;

  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY not found. Get one at https://cloud.cerebras.ai/');
  }

  // Determine model: CLI override > env var > default
  const modelEnv = process.env.CEREBRAS_MODEL;
  const selectedModel = modelOverride || modelEnv || DEFAULT_MODEL;

  // Validate model
  if (!isValidModel(selectedModel)) {
    const availableModels = Object.keys(AVAILABLE_MODELS).join(', ');
    throw new Error(
      `Invalid model: ${selectedModel}. Available models: ${availableModels}`,
    );
  }

  const modelConfig = AVAILABLE_MODELS[selectedModel];
  
  // Ensure maxTokens doesn't exceed model's max context length
  const requestedMaxTokens = parseInt(process.env.CEREBRAS_MAX_TOKENS || '4096', 10);
  const maxTokens = Math.min(requestedMaxTokens, modelConfig.maxContextLength);

  return {
    apiKey,
    model: selectedModel,
    baseUrl: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    maxTokens,
    temperature: parseFloat(process.env.CEREBRAS_TEMPERATURE || '0.7'),
  };
}

export function getOpenAIConfig(modelOverride?: string): OpenAIConfig {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not found. Get one at https://platform.openai.com/api-keys');
  }

  // Determine model: CLI override > env var > default
  const modelEnv = process.env.OPENAI_MODEL;
  const selectedModel = modelOverride || modelEnv || 'gpt-4o-mini';

  // Validate model
  if (!isValidModel(selectedModel)) {
    const availableModels = Object.keys(AVAILABLE_MODELS).join(', ');
    throw new Error(
      `Invalid model: ${selectedModel}. Available models: ${availableModels}`,
    );
  }

  const modelConfig = AVAILABLE_MODELS[selectedModel];
  
  // Ensure maxTokens doesn't exceed model's max context length
  const requestedMaxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '4096', 10);
  const maxTokens = Math.min(requestedMaxTokens, modelConfig.maxContextLength);

  return {
    apiKey,
    model: selectedModel,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    maxTokens,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
  };
}

export function getLLMConfig(modelOverride?: string): CerebrasConfig | OpenAIConfig {
  // Determine provider: check model name first, then API keys
  const modelEnv = process.env.CEREBRAS_MODEL || process.env.OPENAI_MODEL;
  const selectedModel = modelOverride || modelEnv;
  
  // If model is specified, use its provider
  if (selectedModel && isValidModel(selectedModel)) {
    const provider = getModelProvider(selectedModel);
    if (provider === 'openai') {
      return getOpenAIConfig(modelOverride);
    } else {
      return getCerebrasConfig(modelOverride);
    }
  }
  
  // Otherwise, check which API key is available
  if (process.env.OPENAI_API_KEY) {
    return getOpenAIConfig(modelOverride);
  }
  
  // Default to Cerebras
  return getCerebrasConfig(modelOverride);
}

export function getModelConfig(modelName: string): ModelConfig | null {
  return AVAILABLE_MODELS[modelName] || null;
}

export function listAvailableModels(): string[] {
  return Object.keys(AVAILABLE_MODELS);
}

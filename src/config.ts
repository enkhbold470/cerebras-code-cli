import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import type { CerebrasConfig, ProjectConfig } from './types.js';

dotenv.config();

const DEFAULT_MODEL = 'qwen-3-235b-a22b-instruct-2507';

export async function loadProjectConfig(): Promise<ProjectConfig> {
  const configPath = join(process.cwd(), '.cerebrasrc');
  const claudePath = join(process.cwd(), 'CLAUDE.md');
  const config: ProjectConfig = {};

  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      Object.assign(config, JSON.parse(content));
    } catch (error) {
      console.warn('Warning: Could not parse .cerebrasrc');
    }
  }

  if (existsSync(claudePath)) {
    try {
      config.instructions = await readFile(claudePath, 'utf-8');
    } catch {
      console.warn('Warning: Could not read CLAUDE.md');
    }
  }

  return config;
}

export function getCerebrasConfig(): CerebrasConfig {
  const apiKey = process.env.CEREBRAS_API_KEY;

  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY not found. Get one at https://cloud.cerebras.ai/');
  }

  return {
    apiKey,
    model: DEFAULT_MODEL,
    baseUrl: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    maxTokens: parseInt(process.env.CEREBRAS_MAX_TOKENS || '4096', 10),
    temperature: parseFloat(process.env.CEREBRAS_TEMPERATURE || '0.7'),
  };
}

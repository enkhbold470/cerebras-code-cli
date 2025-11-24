export interface QuotaLimits {
  requests: {
    minute: number;
    hour: number;
    day: number;
  };
  tokens: {
    minute: number;
    hour: number;
    day: number;
  };
}

export interface ModelConfig {
  name: string;
  maxContextLength: number;
  quota: QuotaLimits;
}

export const AVAILABLE_MODELS: Record<string, ModelConfig> = {
  'gpt-oss-120b': {
    name: 'gpt-oss-120b',
    maxContextLength: 65536,
    quota: {
      requests: {
        minute: 30,
        hour: 900,
        day: 14400,
      },
      tokens: {
        minute: 64000,
        hour: 1000000,
        day: 1000000,
      },
    },
  },
  'llama-3.3-70b': {
    name: 'llama-3.3-70b',
    maxContextLength: 65536,
    quota: {
      requests: {
        minute: 30,
        hour: 900,
        day: 14400,
      },
      tokens: {
        minute: 64000,
        hour: 1000000,
        day: 1000000,
      },
    },
  },
  'llama3.1-8b': {
    name: 'llama3.1-8b',
    maxContextLength: 8192,
    quota: {
      requests: {
        minute: 30,
        hour: 900,
        day: 14400,
      },
      tokens: {
        minute: 60000,
        hour: 1000000,
        day: 1000000,
      },
    },
  },
  'qwen-3-235b-a22b-instruct-2507': {
    name: 'qwen-3-235b-a22b-instruct-2507',
    maxContextLength: 65536,
    quota: {
      requests: {
        minute: 30,
        hour: 900,
        day: 1440,
      },
      tokens: {
        minute: 64000,
        hour: 1000000,
        day: 1000000,
      },
    },
  },
  'qwen-3-32b': {
    name: 'qwen-3-32b',
    maxContextLength: 65536,
    quota: {
      requests: {
        minute: 30,
        hour: 900,
        day: 14400,
      },
      tokens: {
        minute: 64000,
        hour: 1000000,
        day: 1000000,
      },
    },
  },
  'zai-glm-4.6': {
    name: 'zai-glm-4.6',
    maxContextLength: 64000,
    quota: {
      requests: {
        minute: 10,
        hour: 100,
        day: 100,
      },
      tokens: {
        minute: 60000,
        hour: 100000,
        day: 1000000,
      },
    },
  },
};

export function getModelConfig(modelName: string): ModelConfig | null {
  return AVAILABLE_MODELS[modelName] || null;
}

export function listAvailableModels(): string[] {
  return Object.keys(AVAILABLE_MODELS);
}

export function isValidModel(modelName: string): boolean {
  return modelName in AVAILABLE_MODELS;
}


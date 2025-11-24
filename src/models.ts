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

// OpenAI models
const OPENAI_MODELS: Record<string, ModelConfig> = {
  'gpt-4o': {
    name: 'gpt-4o',
    maxContextLength: 128000,
    quota: {
      requests: {
        minute: 500,
        hour: 10000,
        day: 100000,
      },
      tokens: {
        minute: 1000000,
        hour: 10000000,
        day: 100000000,
      },
    },
  },
  'gpt-4o-mini': {
    name: 'gpt-4o-mini',
    maxContextLength: 128000,
    quota: {
      requests: {
        minute: 500,
        hour: 10000,
        day: 100000,
      },
      tokens: {
        minute: 1000000,
        hour: 10000000,
        day: 100000000,
      },
    },
  },
  'gpt-4-turbo': {
    name: 'gpt-4-turbo',
    maxContextLength: 128000,
    quota: {
      requests: {
        minute: 500,
        hour: 10000,
        day: 100000,
      },
      tokens: {
        minute: 1000000,
        hour: 10000000,
        day: 100000000,
      },
    },
  },
  'gpt-4': {
    name: 'gpt-4',
    maxContextLength: 8192,
    quota: {
      requests: {
        minute: 500,
        hour: 10000,
        day: 100000,
      },
      tokens: {
        minute: 1000000,
        hour: 10000000,
        day: 100000000,
      },
    },
  },
  'gpt-3.5-turbo': {
    name: 'gpt-3.5-turbo',
    maxContextLength: 16385,
    quota: {
      requests: {
        minute: 500,
        hour: 10000,
        day: 100000,
      },
      tokens: {
        minute: 1000000,
        hour: 10000000,
        day: 100000000,
      },
    },
  },
};

// Cerebras models
const CEREBRAS_MODELS: Record<string, ModelConfig> = {
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

// Combine all models
export const AVAILABLE_MODELS: Record<string, ModelConfig> = {
  ...OPENAI_MODELS,
  ...CEREBRAS_MODELS,
};

export function getModelConfig(modelName: string): ModelConfig | null {
  return AVAILABLE_MODELS[modelName] || null;
}

export function getModelProvider(modelName: string): 'openai' | 'cerebras' {
  if (modelName in OPENAI_MODELS) {
    return 'openai';
  }
  return 'cerebras';
}

export function listAvailableModels(): string[] {
  return Object.keys(AVAILABLE_MODELS);
}

export function isValidModel(modelName: string): boolean {
  return modelName in AVAILABLE_MODELS;
}


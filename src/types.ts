export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CerebrasConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ProjectConfig {
  instructions?: string;
  allowedPaths?: string[];
  excludedPaths?: string[];
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

export interface StreamChunk {
  choices: Array<{
    delta: {
      content?: string;
      role?: string;
    };
    finish_reason?: string;
  }>;
}

import type { ModelConfig, QuotaLimits } from './models.js';

interface QuotaWindow {
  requests: number[];
  tokens: number[];
}

export class QuotaTracker {
  private readonly modelConfig: ModelConfig;
  private readonly windows: {
    minute: QuotaWindow;
    hour: QuotaWindow;
    day: QuotaWindow;
  };

  constructor(modelConfig: ModelConfig) {
    this.modelConfig = modelConfig;
    this.windows = {
      minute: { requests: [], tokens: [] },
      hour: { requests: [], tokens: [] },
      day: { requests: [], tokens: [] },
    };
  }

  /**
   * Check if a request can be made without exceeding quota limits
   * @param estimatedTokens Estimated number of tokens for this request
   * @returns Object with canProceed flag and optional error message
   */
  canMakeRequest(estimatedTokens: number = 0): { canProceed: boolean; error?: string } {
    const now = Date.now();
    
    // Clean old entries from windows
    this.cleanWindows(now);

    // Check context length limit
    if (estimatedTokens > this.modelConfig.maxContextLength) {
      return {
        canProceed: false,
        error: `Request exceeds model max context length (${this.modelConfig.maxContextLength}). Estimated: ${estimatedTokens} tokens.`,
      };
    }

    // Check request quotas
    const requestChecks = [
      { window: 'minute', limit: this.modelConfig.quota.requests.minute },
      { window: 'hour', limit: this.modelConfig.quota.requests.hour },
      { window: 'day', limit: this.modelConfig.quota.requests.day },
    ];

    for (const check of requestChecks) {
      const count = this.windows[check.window as keyof typeof this.windows].requests.length;
      if (count >= check.limit) {
        return {
          canProceed: false,
          error: `Request quota exceeded for ${check.window} (${count}/${check.limit} requests). Please wait before making another request.`,
        };
      }
    }

    // Check token quotas
    const tokenChecks = [
      { window: 'minute', limit: this.modelConfig.quota.tokens.minute },
      { window: 'hour', limit: this.modelConfig.quota.tokens.hour },
      { window: 'day', limit: this.modelConfig.quota.tokens.day },
    ];

    for (const check of tokenChecks) {
      const totalTokens = this.windows[check.window as keyof typeof this.windows].tokens.reduce(
        (sum, tokens) => sum + tokens,
        0,
      );
      if (totalTokens + estimatedTokens > check.limit) {
        return {
          canProceed: false,
          error: `Token quota exceeded for ${check.window} (${totalTokens}/${check.limit} tokens used). Estimated request: ${estimatedTokens} tokens. Please wait or reduce request size.`,
        };
      }
    }

    return { canProceed: true };
  }

  /**
   * Record a completed request and its token usage
   * @param tokensUsed Number of tokens used in the request
   */
  recordRequest(tokensUsed: number = 0): void {
    const now = Date.now();
    
    // Clean old entries first to ensure arrays stay in sync
    this.cleanWindows(now);
    
    // Add request timestamp
    this.windows.minute.requests.push(now);
    this.windows.hour.requests.push(now);
    this.windows.day.requests.push(now);

    // Add token usage (must match request count)
    this.windows.minute.tokens.push(tokensUsed);
    this.windows.hour.tokens.push(tokensUsed);
    this.windows.day.tokens.push(tokensUsed);
  }

  /**
   * Get current quota usage statistics
   */
  getQuotaUsage(): {
    requests: { minute: number; hour: number; day: number };
    tokens: { minute: number; hour: number; day: number };
    limits: QuotaLimits;
  } {
    const now = Date.now();
    this.cleanWindows(now);

    return {
      requests: {
        minute: this.windows.minute.requests.length,
        hour: this.windows.hour.requests.length,
        day: this.windows.day.requests.length,
      },
      tokens: {
        minute: this.windows.minute.tokens.reduce((sum, t) => sum + t, 0),
        hour: this.windows.hour.tokens.reduce((sum, t) => sum + t, 0),
        day: this.windows.day.tokens.reduce((sum, t) => sum + t, 0),
      },
      limits: this.modelConfig.quota,
    };
  }

  /**
   * Clean old entries from tracking windows
   */
  private cleanWindows(now: number): void {
    const minuteAgo = now - 60 * 1000;
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    // Clean minute window - keep requests and tokens in sync by filtering together
    const minutePairs = this.windows.minute.requests
      .map((timestamp, index) => ({ timestamp, tokens: this.windows.minute.tokens[index] || 0 }))
      .filter((pair) => pair.timestamp > minuteAgo);
    this.windows.minute.requests = minutePairs.map((p) => p.timestamp);
    this.windows.minute.tokens = minutePairs.map((p) => p.tokens);

    // Clean hour window - keep requests and tokens in sync by filtering together
    const hourPairs = this.windows.hour.requests
      .map((timestamp, index) => ({ timestamp, tokens: this.windows.hour.tokens[index] || 0 }))
      .filter((pair) => pair.timestamp > hourAgo);
    this.windows.hour.requests = hourPairs.map((p) => p.timestamp);
    this.windows.hour.tokens = hourPairs.map((p) => p.tokens);

    // Clean day window - keep requests and tokens in sync by filtering together
    const dayPairs = this.windows.day.requests
      .map((timestamp, index) => ({ timestamp, tokens: this.windows.day.tokens[index] || 0 }))
      .filter((pair) => pair.timestamp > dayAgo);
    this.windows.day.requests = dayPairs.map((p) => p.timestamp);
    this.windows.day.tokens = dayPairs.map((p) => p.tokens);
  }

  /**
   * Reset all quota tracking (useful for testing or manual reset)
   */
  reset(): void {
    this.windows.minute = { requests: [], tokens: [] };
    this.windows.hour = { requests: [], tokens: [] };
    this.windows.day = { requests: [], tokens: [] };
  }
}


import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

export type CcodeMessage = ChatCompletionMessageParam;

export interface CcodeTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface CcodeToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// Note: Cerebras API doesn't support search_parameters (this was Grok/X.AI specific)
// Removed SearchParameters and SearchOptions interfaces

export interface CcodeResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: CcodeToolCall[];
    };
    finish_reason: string;
  }>;
}

export class CcodeClient {
  private client: OpenAI;
  private currentModel: string = "llama-3.3-70b";
  private defaultMaxTokens: number;

  constructor(apiKey: string, model?: string, baseURL?: string) {
    let finalBaseURL = baseURL || process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1";
    
    // Ensure base URL is properly formatted (OpenAI client appends /chat/completions automatically)
    // Remove any trailing slashes and endpoint paths
    finalBaseURL = finalBaseURL.trim();
    finalBaseURL = finalBaseURL.replace(/\/chat\/completions\/?$/, ''); // Remove /chat/completions if present
    finalBaseURL = finalBaseURL.replace(/\/+$/, ''); // Remove trailing slashes
    
    // Ensure it ends with /v1 (required for OpenAI-compatible APIs)
    if (!finalBaseURL.endsWith('/v1')) {
      // If it already has /v1, keep it; otherwise add it
      if (!finalBaseURL.match(/\/v1\/?$/)) {
        finalBaseURL = finalBaseURL + '/v1';
      }
    }
    
    // Warn if using OpenAI model names with non-OpenAI base URL
    const isOpenAIModel = model && /^gpt-|^o1-/.test(model);
    const isOpenAIBaseURL = finalBaseURL.includes('api.openai.com');
    const isCerebrasKey = apiKey.startsWith('csk-');
    
    if (isOpenAIModel && !isOpenAIBaseURL && isCerebrasKey) {
      console.warn(
        `⚠️  Warning: Using OpenAI model "${model}" with Cerebras API. ` +
        `This may cause errors. Use Cerebras models (e.g., llama-3.3-70b) with Cerebras API, ` +
        `or set baseURL to https://api.openai.com/v1 and use OpenAI API key.`
      );
    }
    
    this.client = new OpenAI({
      apiKey,
      baseURL: finalBaseURL,
      timeout: 360000,
    });
    const envMax = Number(process.env.CEREBRAS_MAX_TOKENS);
    // Default max_tokens: Use environment variable if set, otherwise don't set a default
    // Let Cerebras API use model-specific defaults (varies by model: 40k for qwen-3-32b, 64k for llama-3.3-70b, etc.)
    this.defaultMaxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : 0;
    if (model) {
      this.currentModel = model;
    }
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  async chat(
    messages: CcodeMessage[],
    tools?: CcodeTool[],
    model?: string
  ): Promise<CcodeResponse> {
    try {
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        temperature: 0.7,
      };

      // Only set max_tokens if explicitly configured (Cerebras models have different defaults)
      if (this.defaultMaxTokens > 0) {
        requestPayload.max_tokens = this.defaultMaxTokens;
      }

      // Only add tools and tool_choice if tools are provided
      if (tools && tools.length > 0) {
        requestPayload.tools = tools;
        requestPayload.tool_choice = "auto";
      }

      const response =
        await this.client.chat.completions.create(requestPayload);

      return response as CcodeResponse;
    } catch (error: any) {
      // Extract detailed error information from OpenAI client error (which wraps Cerebras API errors)
      let errorMessage = error.message || "Unknown error";
      let statusCode: number | undefined;
      
      // OpenAI client errors have status property
      if (error.status) {
        statusCode = error.status;
        errorMessage = `${error.status} status code`;
      }
      
      // Try multiple ways to extract error details from OpenAI client
      let errorDetails: any = null;
      
      // Method 1: Check error.response (OpenAI client structure)
      if (error.response) {
        errorDetails = error.response.data || error.response.body || error.response;
      }
      
      // Method 2: Check error.error (some OpenAI client versions)
      if (!errorDetails && error.error) {
        errorDetails = error.error;
      }
      
      // Method 3: Check if error itself has the data
      if (!errorDetails && error.data) {
        errorDetails = error.data;
      }
      
      // Parse error details if found
      if (errorDetails) {
        try {
          const parsed = typeof errorDetails === 'string' ? JSON.parse(errorDetails) : errorDetails;
          if (parsed.error?.message) {
            errorMessage += `: ${parsed.error.message}`;
          } else if (parsed.message) {
            errorMessage += `: ${parsed.message}`;
          } else if (parsed.error) {
            errorMessage += `: ${JSON.stringify(parsed.error)}`;
          } else if (typeof parsed === 'string') {
            errorMessage += `: ${parsed}`;
          }
        } catch (e) {
          // If parsing fails, include raw response
          const rawData = typeof errorDetails === 'string' 
            ? errorDetails 
            : JSON.stringify(errorDetails);
          errorMessage += ` (${rawData.substring(0, 200)})`;
        }
      }
      
      // For 404 errors, provide helpful diagnostic information
      if (statusCode === 404) {
        const baseURL = this.client.baseURL || "https://api.cerebras.ai/v1";
        const modelName = model || this.currentModel;
        errorMessage += `. Diagnostic: Base URL=${baseURL}, Model=${modelName}, Endpoint should be ${baseURL}/chat/completions`;
      }
      
      throw new Error(`Cerebras API error: ${errorMessage}`);
    }
  }

  async *chatStream(
    messages: CcodeMessage[],
    tools?: CcodeTool[],
    model?: string
  ): AsyncGenerator<any, void, unknown> {
    try {
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        temperature: 0.7,
        stream: true,
      };

      // Only set max_tokens if explicitly configured (Cerebras models have different defaults)
      if (this.defaultMaxTokens > 0) {
        requestPayload.max_tokens = this.defaultMaxTokens;
      }

      // Only add tools and tool_choice if tools are provided
      if (tools && tools.length > 0) {
        requestPayload.tools = tools;
        requestPayload.tool_choice = "auto";
      }

      const stream = (await this.client.chat.completions.create(
        requestPayload
      )) as any;

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error: any) {
      // Extract detailed error information from OpenAI client error (which wraps Cerebras API errors)
      let errorMessage = error.message || "Unknown error";
      let statusCode: number | undefined;
      
      // OpenAI client errors have status property
      if (error.status) {
        statusCode = error.status;
        errorMessage = `${error.status} status code`;
      }
      
      // Try multiple ways to extract error details from OpenAI client
      let errorDetails: any = null;
      
      // Method 1: Check error.response (OpenAI client structure)
      if (error.response) {
        errorDetails = error.response.data || error.response.body || error.response;
      }
      
      // Method 2: Check error.error (some OpenAI client versions)
      if (!errorDetails && error.error) {
        errorDetails = error.error;
      }
      
      // Method 3: Check if error itself has the data
      if (!errorDetails && error.data) {
        errorDetails = error.data;
      }
      
      // Parse error details if found
      if (errorDetails) {
        try {
          const parsed = typeof errorDetails === 'string' ? JSON.parse(errorDetails) : errorDetails;
          if (parsed.error?.message) {
            errorMessage += `: ${parsed.error.message}`;
          } else if (parsed.message) {
            errorMessage += `: ${parsed.message}`;
          } else if (parsed.error) {
            errorMessage += `: ${JSON.stringify(parsed.error)}`;
          } else if (typeof parsed === 'string') {
            errorMessage += `: ${parsed}`;
          }
        } catch (e) {
          // If parsing fails, include raw response
          const rawData = typeof errorDetails === 'string' 
            ? errorDetails 
            : JSON.stringify(errorDetails);
          errorMessage += ` (${rawData.substring(0, 200)})`;
        }
      }
      
      // For 404 errors, provide helpful diagnostic information
      if (statusCode === 404) {
        const baseURL = this.client.baseURL || "https://api.cerebras.ai/v1";
        const modelName = model || this.currentModel;
        errorMessage += `. Diagnostic: Base URL=${baseURL}, Model=${modelName}, Endpoint should be ${baseURL}/chat/completions`;
      }
      
      throw new Error(`Cerebras API error: ${errorMessage}`);
    }
  }
}



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

export interface SearchParameters {
  mode?: "auto" | "on" | "off";
  // sources removed - let API use default sources to avoid format issues
}

export interface SearchOptions {
  search_parameters?: SearchParameters;
}

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
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1",
      timeout: 360000,
    });
    const envMax = Number(process.env.CEREBRAS_MAX_TOKENS);
    this.defaultMaxTokens = Number.isFinite(envMax) && envMax > 0 ? envMax : 1536;
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
    model?: string,
    searchOptions?: SearchOptions
  ): Promise<CcodeResponse> {
    try {
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        tools: tools || [],
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
      };

      // Add search parameters if specified
      if (searchOptions?.search_parameters) {
        requestPayload.search_parameters = searchOptions.search_parameters;
      }

      const response =
        await this.client.chat.completions.create(requestPayload);

      return response as CcodeResponse;
    } catch (error: any) {
      throw new Error(`Cerebras API error: ${error.message}`);
    }
  }

  async *chatStream(
    messages: CcodeMessage[],
    tools?: CcodeTool[],
    model?: string,
    searchOptions?: SearchOptions
  ): AsyncGenerator<any, void, unknown> {
    try {
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        tools: tools || [],
        tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        temperature: 0.7,
        max_tokens: this.defaultMaxTokens,
        stream: true,
      };

      // Add search parameters if specified
      if (searchOptions?.search_parameters) {
        requestPayload.search_parameters = searchOptions.search_parameters;
      }

      const stream = (await this.client.chat.completions.create(
        requestPayload
      )) as any;

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error: any) {
      throw new Error(`Cerebras API error: ${error.message}`);
    }
  }

  async search(
    query: string,
    searchParameters?: SearchParameters
  ): Promise<CcodeResponse> {
    const searchMessage: CcodeMessage = {
      role: "user",
      content: query,
    };

    const searchOptions: SearchOptions = {
      search_parameters: searchParameters || { mode: "on" },
    };

    return this.chat([searchMessage], [], undefined, searchOptions);
  }
}

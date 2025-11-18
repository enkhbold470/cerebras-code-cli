import type { ToolDefinition, ToolCall, ToolExecuteContext } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private ctx: ToolExecuteContext;

  constructor(tools: ToolDefinition[], ctx: ToolExecuteContext) {
    tools.forEach((tool) => this.tools.set(tool.name, tool));
    this.ctx = ctx;
  }

  listSummaries(): string {
    return Array.from(this.tools.values())
      .map((tool) => {
        const schema = Object.entries(tool.inputSchema)
          .map(
            ([key, value]) =>
              `  - ${key}${value.required ? ' (required)' : ''}: ${value.description}${
                value.enum ? ` [one of: ${value.enum.join(', ')}]` : ''
              }`,
          )
          .join('\n');
        const examples = tool.examples?.length ? `  examples: ${tool.examples.join(' | ')}` : '';
        return `• ${tool.name}: ${tool.description}\n${schema}${examples ? `\n${examples}` : ''}`;
      })
      .join('\n\n');
  }

  async execute(call: ToolCall): Promise<string> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${call.name}`);
    }

    return tool.execute(call.input, this.ctx);
  }
}

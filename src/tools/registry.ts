import inquirer from 'inquirer';
import type { ToolDefinition, ToolCall, ToolExecuteContext } from './types.js';
import type { SessionState, ApprovalSubject } from '../session/state.js';
import type { SessionTracker } from '../session/tracker.js';

const TOOL_APPROVAL_SUBJECT: Partial<Record<string, ApprovalSubject>> = {
  write_file: 'write_file',
  run_bash: 'run_bash',
};

interface ToolRegistryOptions {
  sessionState?: SessionState;
  tracker?: SessionTracker;
  interactive?: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private ctx: ToolExecuteContext;
  private readonly sessionState?: SessionState;
  private readonly tracker?: SessionTracker;
  private readonly interactive: boolean;

  constructor(tools: ToolDefinition[], ctx: ToolExecuteContext, options?: ToolRegistryOptions) {
    tools.forEach((tool) => this.tools.set(tool.name, tool));
    this.sessionState = options?.sessionState;
    this.tracker = options?.tracker;
    this.interactive = options?.interactive ?? true;
    this.ctx = {
      ...ctx,
      tracker: this.tracker,
      sessionState: this.sessionState,
    };
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

    if (await this.requiresApproval(call.name)) {
      const approved = await this.promptApproval(call);
      if (!approved) {
        return `Approval denied for ${call.name}.`;
      }
    }

    this.tracker?.recordToolCall(call.name);
    return tool.execute(call.input, this.ctx);
  }

  private async requiresApproval(toolName: string): Promise<boolean> {
    if (!this.sessionState) return false;
    const subject = TOOL_APPROVAL_SUBJECT[toolName];
    if (!subject) return false;
    return !this.sessionState.isAutoApproved(subject);
  }

  private async promptApproval(call: ToolCall): Promise<boolean> {
    if (!this.interactive) {
      return true;
    }
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Allow tool "${call.name}" with input ${JSON.stringify(call.input)}?`,
        default: false,
      },
    ]);
    return confirm;
  }
}

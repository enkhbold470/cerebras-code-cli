import type { FileManager } from '../file-manager.js';
import type { SessionTracker } from '../session/tracker.js';
import type { SessionState } from '../session/state.js';

export interface ToolSchema {
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolInputSchema {
  [key: string]: ToolSchema;
}

export interface ToolExecuteContext {
  fileManager: FileManager;
  projectRoot: string;
  tracker?: SessionTracker;
  sessionState?: SessionState;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  examples?: string[];
  execute: (input: Record<string, unknown>, ctx: ToolExecuteContext) => Promise<string>;
}

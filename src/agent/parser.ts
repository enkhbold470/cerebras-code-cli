import type { ToolCall } from '../tools/types.js';

export type ParsedAssistantResponse =
  | { type: 'final'; message: string }
  | { type: 'tool_calls'; calls: ToolCall[] };

function tryParseJson(text: string): any | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonBlockMatch = trimmed.match(/```json\s*([\s\S]+?)```/i);
    if (jsonBlockMatch) {
      try {
        return JSON.parse(jsonBlockMatch[1]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function parseAssistantResponse(raw: string): ParsedAssistantResponse | null {
  const payload = tryParseJson(raw);
  if (payload && typeof payload === 'object') {
    if (typeof payload.final_response === 'string') {
      return { type: 'final', message: payload.final_response };
    }

    if (Array.isArray(payload.tool_calls)) {
      const calls: ToolCall[] = payload.tool_calls
        .map((call: Record<string, unknown>) => {
          if (!call || typeof call !== 'object') return null;
          if (typeof call.name !== 'string' || typeof call.id !== 'string') return null;
          if (!call.input || typeof call.input !== 'object') return null;
          return { id: call.id, name: call.name, input: call.input };
        })
        .filter(Boolean) as ToolCall[];

      if (calls.length) {
        return { type: 'tool_calls', calls };
      }
    }
  }

  // Try parsing markdown-style tool calls (fallback for agents that use **Action:** format)
  // Extract action name and input separately
  const actionMatch = raw.match(/\*\*Action:\*\*\s*(\w+)/);
  const inputMatch = raw.match(/\*\*Action Input:\*\*\s*(\{[\s\S]*?\})/);

  if (actionMatch && inputMatch) {
    const actionName = actionMatch[1];
    const actionInput = inputMatch[1];

    try {
      const input = JSON.parse(actionInput);
      const calls: ToolCall[] = [{
        id: `call-${Date.now()}`,
        name: actionName,
        input
      }];
      return { type: 'tool_calls', calls };
    } catch (error) {
      // Invalid JSON in action input
      return null;
    }
  }

  return null;
}

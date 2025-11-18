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
  if (!payload || typeof payload !== 'object') return null;

  if (typeof payload.final_response === 'string') {
    return { type: 'final', message: payload.final_response };
  }

  if (Array.isArray(payload.tool_calls)) {
    const calls: ToolCall[] = payload.tool_calls
      .map((call: Record<string, unknown>) => {
        if (!call || typeof call !== 'object') return null;
        if (typeof call.name !== 'string' || typeof call.id !== 'string') return null;
        const input = typeof call.input === 'object' && call.input !== null ? call.input : {};
        return { id: call.id, name: call.name, input };
      })
      .filter(Boolean) as ToolCall[];

    if (calls.length) {
      return { type: 'tool_calls', calls };
    }
  }

  return null;
}

import type { ToolCall } from '../tools/types.js';
import { debugLog, debugError } from '../utils/debug.js';

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
  
  if (actionMatch) {
    const actionName = actionMatch[1];
    debugLog('Parser: Found action:', actionName);
    
    // Find the Action Input section and extract JSON properly
    // Look for **Action Input:** followed by JSON (handle nested braces)
    const actionInputStart = raw.indexOf('**Action Input:**');
    if (actionInputStart !== -1) {
      // Find the start of the JSON object after "Action Input:"
      const jsonStart = raw.indexOf('{', actionInputStart);
      if (jsonStart !== -1) {
        // Parse JSON by counting braces to find the complete object
        let braceCount = 0;
        let jsonEnd = jsonStart;
        let inString = false;
        let escapeNext = false;
        
        for (let i = jsonStart; i < raw.length; i++) {
          const char = raw[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEnd = i + 1;
                break;
              }
            }
          }
        }
        
        const actionInput = raw.substring(jsonStart, jsonEnd);
        debugLog('Parser: Extracted JSON length:', actionInput.length);
        debugLog('Parser: JSON preview:', actionInput.substring(0, 100));
        
        try {
          const input = JSON.parse(actionInput);
          debugLog('Parser: Successfully parsed JSON');
          const calls: ToolCall[] = [{
            id: `call-${Date.now()}`,
            name: actionName,
            input
          }];
          return { type: 'tool_calls', calls };
        } catch (error) {
          debugError('Parser: Failed to parse JSON:', error);
          debugError('Parser: JSON that failed:', actionInput.substring(0, 200));
          // Invalid JSON in action input
          return null;
        }
      }
    }
  }

  return null;
}

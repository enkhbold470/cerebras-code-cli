import { describe, it, expect } from 'vitest';
import { parseAssistantResponse } from '../../src/agent/parser.js';

describe('parseAssistantResponse', () => {
  describe('JSON format parsing', () => {
    it('should parse final_response correctly', () => {
      const input = '{"final_response": "This is a final answer"}';
      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('final');
      expect(result?.message).toBe('This is a final answer');
    });

    it('should parse tool_calls correctly', () => {
      const input = {
        tool_calls: [{
          id: 'call-123',
          name: 'list_directory',
          input: { path: '.' }
        }]
      };
      const result = parseAssistantResponse(JSON.stringify(input));

      expect(result).not.toBeNull();
      expect(result?.type).toBe('tool_calls');
      expect(result?.calls).toHaveLength(1);
      expect(result?.calls[0].id).toBe('call-123');
      expect(result?.calls[0].name).toBe('list_directory');
      expect(result?.calls[0].input).toEqual({ path: '.' });
    });

    it('should parse multiple tool calls', () => {
      const input = {
        tool_calls: [
          { id: 'call-1', name: 'read_file', input: { file_path: 'a.txt' } },
          { id: 'call-2', name: 'write_file', input: { file_path: 'b.txt', content: 'hello' } }
        ]
      };
      const result = parseAssistantResponse(JSON.stringify(input));

      expect(result).not.toBeNull();
      expect(result?.type).toBe('tool_calls');
      expect(result?.calls).toHaveLength(2);
      expect(result?.calls[0].name).toBe('read_file');
      expect(result?.calls[1].name).toBe('write_file');
    });

    it('should handle tool calls with complex input', () => {
      const input = {
        tool_calls: [{
          id: 'call-complex',
          name: 'run_bash',
          input: {
            command: 'ls -la',
            description: 'List files',
            timeout: 30000
          }
        }]
      };
      const result = parseAssistantResponse(JSON.stringify(input));

      expect(result).not.toBeNull();
      expect(result?.calls[0].input).toEqual({
        command: 'ls -la',
        description: 'List files',
        timeout: 30000
      });
    });

    it('should filter out invalid tool calls', () => {
      const input = {
        tool_calls: [
          { id: 'valid', name: 'list_directory', input: { path: '.' } },
          { name: 'invalid', input: {} }, // Missing id
          { id: 'invalid2', input: {} }, // Missing name
          { id: 'invalid3', name: 'invalid4' } // Missing input
        ]
      };
      const result = parseAssistantResponse(JSON.stringify(input));

      expect(result).not.toBeNull();
      expect(result?.calls).toHaveLength(1);
      expect(result?.calls[0].id).toBe('valid');
    });
  });

  describe('Markdown format parsing', () => {
    it('should parse basic markdown tool call', () => {
      const input = `**Thought:** I need to list files
**Action:** list_directory
**Action Input:** {"path": "."}`;

      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('tool_calls');
      expect(result?.calls).toHaveLength(1);
      expect(result?.calls[0].name).toBe('list_directory');
      expect(result?.calls[0].input).toEqual({ path: '.' });
    });

    it('should parse markdown with complex JSON input', () => {
      const input = `**Thought:** I need to write a file
**Action:** write_file
**Action Input:** {"file_path": "test.txt", "content": "Hello World"}`;

      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.calls[0].name).toBe('write_file');
      expect(result?.calls[0].input).toEqual({
        file_path: 'test.txt',
        content: 'Hello World'
      });
    });

    it('should parse markdown with multiline JSON', () => {
      const input = `**Thought:** Complex operation
**Action:** run_bash
**Action Input:** {
  "command": "npm install",
  "description": "Install dependencies",
  "timeout": 60000
}`;

      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.calls[0].name).toBe('run_bash');
      expect(result?.calls[0].input).toEqual({
        command: 'npm install',
        description: 'Install dependencies',
        timeout: 60000
      });
    });

    it('should handle missing action input', () => {
      const input = `**Thought:** Just thinking
**Action:** list_directory`;

      const result = parseAssistantResponse(input);
      expect(result).toBeNull();
    });

    it('should handle missing action', () => {
      const input = `**Thought:** Just thinking
**Action Input:** {"path": "."}`;

      const result = parseAssistantResponse(input);
      expect(result).toBeNull();
    });

    it('should handle invalid JSON in action input', () => {
      const input = `**Thought:** Error case
**Action:** list_directory
**Action Input:** {invalid json}`;

      const result = parseAssistantResponse(input);
      expect(result).toBeNull();
    });

    it('should handle extra whitespace and formatting', () => {
      const input = `
**Thought:**   I need to list files
**Action:**   list_directory
**Action Input:**   {"path": "."}
      `;

      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.calls[0].name).toBe('list_directory');
      expect(result?.calls[0].input).toEqual({ path: '.' });
    });
  });

  describe('Error cases', () => {
    it('should return null for invalid JSON', () => {
      const input = '{invalid json';
      const result = parseAssistantResponse(input);
      expect(result).toBeNull();
    });

    it('should return null for non-object JSON', () => {
      const input = '"just a string"';
      const result = parseAssistantResponse(input);
      expect(result).toBeNull();
    });

    it('should return null for empty input', () => {
      const result = parseAssistantResponse('');
      expect(result).toBeNull();
    });

    it('should return null for plain text without tool calls', () => {
      const input = 'This is just plain text with no tool calls.';
      const result = parseAssistantResponse(input);
      expect(result).toBeNull();
    });

    it('should return null for markdown without proper format', () => {
      const input = `**Thought:** Thinking
Some random text
**Conclusion:** Done`;
      const result = parseAssistantResponse(input);
      expect(result).toBeNull();
    });
  });

  describe('Mixed content', () => {
    it('should prioritize JSON over markdown', () => {
      const input = `{"final_response": "JSON response"}`;

      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('final');
      expect(result?.message).toBe('JSON response');
    });

    it('should handle JSON with markdown-like content', () => {
      const input = '{"final_response": "**Bold text** and *italic*"}';
      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.type).toBe('final');
      expect(result?.message).toBe('**Bold text** and *italic*');
    });
  });

  describe('Edge cases', () => {
    it('should handle tool names with underscores', () => {
      const input = `**Action:** run_bash_command
**Action Input:** {"command": "ls"}`;

      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.calls[0].name).toBe('run_bash_command');
    });

    it('should handle empty object input', () => {
      const input = `**Action:** list_directory
**Action Input:** {}`;

      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.calls[0].input).toEqual({});
    });

    it('should handle boolean and number values in JSON', () => {
      const input = `**Action:** run_bash
**Action Input:** {"command": "test", "interactive": true, "timeout": 5000}`;

      const result = parseAssistantResponse(input);

      expect(result).not.toBeNull();
      expect(result?.calls[0].input).toEqual({
        command: 'test',
        interactive: true,
        timeout: 5000
      });
    });
  });
});

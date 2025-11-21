import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MCPClient } from '../../src/mcp/client.js';

describe('MCPClient', () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cerebras-mcp-test-${Date.now()}`);
    configPath = join(testDir, 'mcp-servers.json');
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('loadConfig', () => {
    it('should return null when config file does not exist', async () => {
      const client = new MCPClient(configPath);
      const config = await client.loadConfig();
      expect(config).toBeNull();
    });

    it('should load valid MCP server configuration', async () => {
      const configContent = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            env: {},
          },
        },
      };

      await writeFile(configPath, JSON.stringify(configContent));

      const client = new MCPClient(configPath);
      const config = await client.loadConfig();

      expect(config).toBeDefined();
      expect(config?.mcpServers).toBeDefined();
      expect(config?.mcpServers.filesystem).toBeDefined();
      expect(config?.mcpServers.filesystem.command).toBe('npx');
    });

    it('should return null for invalid JSON', async () => {
      await writeFile(configPath, 'invalid json');

      const client = new MCPClient(configPath);
      const config = await client.loadConfig();

      expect(config).toBeNull();
    });
  });

  describe('listTools', () => {
    it('should return empty array (placeholder)', async () => {
      const client = new MCPClient(configPath);
      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('callTool', () => {
    it('should throw error (not yet implemented)', async () => {
      const client = new MCPClient(configPath);
      await expect(
        client.callTool('server', 'tool', {}),
      ).rejects.toThrow('MCP tool calls not yet implemented');
    });
  });

  describe('shutdown', () => {
    it('should shutdown without errors', () => {
      const client = new MCPClient(configPath);
      expect(() => client.shutdown()).not.toThrow();
    });
  });
});

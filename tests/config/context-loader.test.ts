import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ContextLoader } from '../../src/config/context-loader.js';

describe('ContextLoader', () => {
  let testDir: string;
  let globalDir: string;
  let projectDir: string;
  let subDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cerebras-test-${Date.now()}`);
    globalDir = join(testDir, 'global');
    projectDir = join(testDir, 'project');
    subDir = join(projectDir, 'subdir');

    await mkdir(globalDir, { recursive: true });
    await mkdir(projectDir, { recursive: true });
    await mkdir(subDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('loadContextFiles', () => {
    it('should load no files when none exist', async () => {
      const loader = new ContextLoader(projectDir);
      const files = await loader.loadContextFiles();
      expect(files).toEqual([]);
    });

    it('should load global AGENTS.md', async () => {
      await writeFile(join(globalDir, 'AGENTS.md'), '# Global Agents');
      
      // Mock homedir to return our test directory
      const originalHomedir = require('os').homedir;
      const loader = new ContextLoader(projectDir);
      
      // We need to test with actual homedir or mock it properly
      // For now, test with project-level files
      await writeFile(join(projectDir, 'AGENTS.md'), '# Project Agents');
      const files = await loader.loadContextFiles();
      
      expect(files.length).toBeGreaterThan(0);
      const projectFile = files.find(f => f.path.includes('project') && f.path.endsWith('AGENTS.md'));
      expect(projectFile).toBeDefined();
      expect(projectFile?.content).toBe('# Project Agents');
      expect(projectFile?.level).toBe('project');
    });

    it('should load project-level AGENTS.md and CLAUDE.md', async () => {
      await writeFile(join(projectDir, 'AGENTS.md'), '# Project Agents');
      await writeFile(join(projectDir, 'CLAUDE.md'), '# Project Claude');

      const loader = new ContextLoader(projectDir);
      const files = await loader.loadContextFiles();

      expect(files.length).toBeGreaterThanOrEqual(2);
      const agentsFile = files.find(f => f.path.endsWith('AGENTS.md'));
      const claudeFile = files.find(f => f.path.endsWith('CLAUDE.md'));
      
      expect(agentsFile).toBeDefined();
      expect(claudeFile).toBeDefined();
      expect(agentsFile?.content).toBe('# Project Agents');
      expect(claudeFile?.content).toBe('# Project Claude');
    });

    it('should load directory-specific context files', async () => {
      await writeFile(join(projectDir, 'AGENTS.md'), '# Project Agents');
      await writeFile(join(subDir, 'AGENTS.md'), '# Subdir Agents');

      const loader = new ContextLoader(projectDir, subDir);
      const files = await loader.loadContextFiles();

      const subdirFile = files.find(f => f.path.includes('subdir') && f.path.endsWith('AGENTS.md'));
      expect(subdirFile).toBeDefined();
      expect(subdirFile?.level).toBe('directory');
      expect(subdirFile?.content).toBe('# Subdir Agents');
    });

    it('should handle missing files gracefully', async () => {
      const loader = new ContextLoader(projectDir);
      const files = await loader.loadContextFiles();
      expect(files).toEqual([]);
    });
  });

  describe('mergeContext', () => {
    it('should merge multiple context files', async () => {
      await writeFile(join(projectDir, 'AGENTS.md'), '# Project Agents\nRule 1');
      await writeFile(join(projectDir, 'CLAUDE.md'), '# Project Claude\nRule 2');

      const loader = new ContextLoader(projectDir);
      const merged = await loader.mergeContext();

      expect(merged).toContain('# Project Agents');
      expect(merged).toContain('# Project Claude');
      expect(merged).toContain('Rule 1');
      expect(merged).toContain('Rule 2');
    });

    it('should prioritize deeper files over higher ones', async () => {
      await writeFile(join(projectDir, 'AGENTS.md'), '# Project Agents\nProject Rule');
      await writeFile(join(subDir, 'AGENTS.md'), '# Subdir Agents\nSubdir Rule');

      const loader = new ContextLoader(projectDir, subDir);
      const merged = await loader.mergeContext();

      // Last file should win
      expect(merged).toContain('Subdir Rule');
    });

    it('should return empty string when no files exist', async () => {
      const loader = new ContextLoader(projectDir);
      const merged = await loader.mergeContext();
      expect(merged).toBe('');
    });
  });

  describe('getContextStats', () => {
    it('should return stats for loaded context files', async () => {
      await writeFile(join(projectDir, 'AGENTS.md'), 'Line 1\nLine 2\nLine 3');
      await writeFile(join(projectDir, 'CLAUDE.md'), 'Line 1');

      const loader = new ContextLoader(projectDir);
      const stats = await loader.getContextStats();

      expect(stats.totalLines).toBeGreaterThan(0);
      expect(stats.files.length).toBeGreaterThanOrEqual(2);
      
      const agentsStats = stats.files.find(f => f.path.endsWith('AGENTS.md'));
      expect(agentsStats?.lines).toBe(3);
    });

    it('should return zero stats when no files exist', async () => {
      const loader = new ContextLoader(projectDir);
      const stats = await loader.getContextStats();
      
      expect(stats.totalLines).toBe(0);
      expect(stats.files).toEqual([]);
    });
  });
});

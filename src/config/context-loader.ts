import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

export interface ContextFile {
  path: string;
  content: string;
  level: 'global' | 'project' | 'directory';
}

/**
 * Loads hierarchical context files (AGENTS.md, CLAUDE.md) following priority:
 * global (~/.cerebras/) → project root → current directory
 * Deeper files override higher ones
 */
export class ContextLoader {
  private projectRoot: string;
  private currentDir: string;

  constructor(projectRoot: string = process.cwd(), currentDir?: string) {
    this.projectRoot = projectRoot;
    this.currentDir = currentDir || projectRoot;
  }

  /**
   * Load all context files in hierarchical order
   */
  async loadContextFiles(): Promise<ContextFile[]> {
    const files: ContextFile[] = [];

    // 1. Global context (~/.cerebras/AGENTS.md, ~/.cerebras/CLAUDE.md)
    const globalDir = join(homedir(), '.cerebras');
    const globalAgents = await this.loadFile(join(globalDir, 'AGENTS.md'), 'global');
    const globalClaude = await this.loadFile(join(globalDir, 'CLAUDE.md'), 'global');
    if (globalAgents) files.push(globalAgents);
    if (globalClaude) files.push(globalClaude);

    // 2. Project root context
    const projectAgents = await this.loadFile(join(this.projectRoot, 'AGENTS.md'), 'project');
    const projectClaude = await this.loadFile(join(this.projectRoot, 'CLAUDE.md'), 'project');
    if (projectAgents) files.push(projectAgents);
    if (projectClaude) files.push(projectClaude);

    // 3. Directory-specific context (if currentDir differs from projectRoot)
    if (this.currentDir !== this.projectRoot) {
      const dirAgents = await this.loadFile(join(this.currentDir, 'AGENTS.md'), 'directory');
      const dirClaude = await this.loadFile(join(this.currentDir, 'CLAUDE.md'), 'directory');
      if (dirAgents) files.push(dirAgents);
      if (dirClaude) files.push(dirClaude);
    }

    return files;
  }

  /**
   * Merge context files into a single string
   * Later files override earlier ones
   */
  async mergeContext(): Promise<string> {
    const files = await this.loadContextFiles();
    if (files.length === 0) return '';

    // Group by type (AGENTS.md vs CLAUDE.md)
    const agentsFiles = files.filter((f) => f.path.endsWith('AGENTS.md'));
    const claudeFiles = files.filter((f) => f.path.endsWith('CLAUDE.md'));

    const parts: string[] = [];

    // AGENTS.md takes precedence (load last one)
    if (agentsFiles.length > 0) {
      const lastAgents = agentsFiles[agentsFiles.length - 1];
      parts.push(`# AGENTS.md (${lastAgents.level})\n${lastAgents.content}`);
    }

    // CLAUDE.md supplements (load last one)
    if (claudeFiles.length > 0) {
      const lastClaude = claudeFiles[claudeFiles.length - 1];
      parts.push(`# CLAUDE.md (${lastClaude.level})\n${lastClaude.content}`);
    }

    return parts.join('\n\n');
  }

  /**
   * Load a single context file if it exists
   */
  private async loadFile(
    filePath: string,
    level: ContextFile['level'],
  ): Promise<ContextFile | null> {
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      return {
        path: filePath,
        content: content.trim(),
        level,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get context file size budget info
   */
  async getContextStats(): Promise<{
    totalLines: number;
    files: Array<{ path: string; lines: number; level: string }>;
  }> {
    const files = await this.loadContextFiles();
    const stats = files.map((f) => ({
      path: f.path,
      lines: f.content.split('\n').length,
      level: f.level,
    }));

    return {
      totalLines: stats.reduce((sum, s) => sum + s.lines, 0),
      files: stats,
    };
  }
}

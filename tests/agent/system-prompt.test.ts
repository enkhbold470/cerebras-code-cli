import { describe, it, expect, beforeEach } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/system-prompt.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { toolDefinitions } from '../../src/tools/definitions.js';
import { FileManager } from '../../src/file-manager.js';
import { SessionState } from '../../src/session/state.js';
import type { ProjectConfig } from '../../src/types.js';

describe('buildSystemPrompt', () => {
  let toolRegistry: ToolRegistry;
  let projectConfig: ProjectConfig;
  let sessionState: SessionState;
  let fileManager: FileManager;

  beforeEach(() => {
    fileManager = new FileManager();
    toolRegistry = new ToolRegistry(toolDefinitions, {
      fileManager,
      projectRoot: process.cwd(),
    });
    projectConfig = {};
    sessionState = new SessionState('test-model');
  });

  it('should include role and identity section', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('ROLE & IDENTITY');
    expect(prompt).toContain('expert coding agent');
  });

  it('should include core capabilities', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('CORE CAPABILITIES');
    expect(prompt).toContain('Edit files');
    expect(prompt).toContain('Run tests');
  });

  it('should include ReAct loop pattern', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('REASONING PATTERN');
    expect(prompt).toContain('THOUGHT');
    expect(prompt).toContain('ACTION');
    expect(prompt).toContain('OBSERVATION');
  });

  it('should include response format', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('RESPONSE FORMAT');
    expect(prompt).toContain('tool_calls');
    expect(prompt).toContain('final_response');
  });

  it('should include tool usage guidelines', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('TOOL USAGE GUIDELINES');
    expect(prompt).toContain('ALWAYS use tools');
  });

  it('should include safety and permissions', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('SAFETY & PERMISSIONS');
  });

  it('should include code quality standards', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('CODE QUALITY STANDARDS');
  });

  it('should include self-verification protocol', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('SELF-VERIFICATION PROTOCOL');
    expect(prompt).toContain('Type Safety Check');
    expect(prompt).toContain('Linting Check');
  });

  it('should include available tools', () => {
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('AVAILABLE TOOLS');
    expect(prompt).toContain('read_file');
    expect(prompt).toContain('write_file');
  });

  it('should include project instructions when provided', () => {
    projectConfig.instructions = '# Project Rules\nUse TypeScript';
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('PROJECT CONTEXT');
    expect(prompt).toContain('Project Rules');
    expect(prompt).toContain('Use TypeScript');
  });

  it('should include reasoning preference', () => {
    sessionState.setReasoning('thorough');
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('REASONING PREFERENCE');
    expect(prompt).toContain('thorough');
  });

  it('should include approval policy', () => {
    sessionState.setApprovals({ write_file: true, run_bash: false });
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('TOOL APPROVAL POLICY');
    expect(prompt).toContain('write_file: auto');
    expect(prompt).toContain('run_bash: ask');
  });

  it('should include focus files when mentioned', () => {
    sessionState.addMention('src/index.ts');
    sessionState.addMention('src/utils.ts');
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, sessionState);
    expect(prompt).toContain('FOCUS FILES');
    expect(prompt).toContain('src/index.ts');
    expect(prompt).toContain('src/utils.ts');
  });

  it('should include custom system instruction', () => {
    const state = new SessionState('model', 'Always run tests');
    const prompt = buildSystemPrompt(toolRegistry, projectConfig, state);
    expect(prompt).toContain('ADDITIONAL USER INSTRUCTIONS');
    expect(prompt).toContain('Always run tests');
  });

  it('should filter out empty sections', () => {
    const prompt = buildSystemPrompt(toolRegistry, {}, sessionState);
    // Should not have duplicate newlines from empty sections
    expect(prompt.split('\n\n\n').length).toBeLessThan(3);
  });
});

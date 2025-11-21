import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../../src/session/state.js';

describe('SessionState', () => {
  let sessionState: SessionState;

  beforeEach(() => {
    sessionState = new SessionState('test-model');
  });

  describe('Permission Modes', () => {
    it('should default to interactive mode', () => {
      expect(sessionState.getPermissionMode()).toBe('interactive');
      expect(sessionState.isYoloMode()).toBe(false);
    });

    it('should set permission mode to auto-accept', () => {
      sessionState.setPermissionMode('auto-accept');
      expect(sessionState.getPermissionMode()).toBe('auto-accept');
      expect(sessionState.isYoloMode()).toBe(false);
    });

    it('should set permission mode to yolo and auto-approve all', () => {
      sessionState.setPermissionMode('yolo');
      expect(sessionState.getPermissionMode()).toBe('yolo');
      expect(sessionState.isYoloMode()).toBe(true);
      expect(sessionState.isAutoApproved('write_file')).toBe(true);
      expect(sessionState.isAutoApproved('run_bash')).toBe(true);
    });

    it('should not auto-approve in interactive mode', () => {
      sessionState.setPermissionMode('interactive');
      expect(sessionState.isAutoApproved('write_file')).toBe(false);
      expect(sessionState.isAutoApproved('run_bash')).toBe(false);
    });
  });

  describe('Approvals', () => {
    it('should set individual approval', () => {
      sessionState.setApproval('write_file', true);
      expect(sessionState.isAutoApproved('write_file')).toBe(true);
      expect(sessionState.isAutoApproved('run_bash')).toBe(false);
    });

    it('should set multiple approvals', () => {
      sessionState.setApprovals({
        write_file: true,
        run_bash: true,
      });
      expect(sessionState.isAutoApproved('write_file')).toBe(true);
      expect(sessionState.isAutoApproved('run_bash')).toBe(true);
    });

    it('should provide approvals summary', () => {
      sessionState.setApprovals({
        write_file: true,
        run_bash: false,
      });
      const summary = sessionState.approvalsSummary();
      expect(summary).toContain('write_file: auto');
      expect(summary).toContain('run_bash: ask');
    });
  });

  describe('Reasoning Modes', () => {
    it('should default to balanced reasoning', () => {
      expect(sessionState.getReasoning()).toBe('balanced');
    });

    it('should set reasoning mode', () => {
      sessionState.setReasoning('fast');
      expect(sessionState.getReasoning()).toBe('fast');
      
      sessionState.setReasoning('thorough');
      expect(sessionState.getReasoning()).toBe('thorough');
    });

    it('should provide reasoning description', () => {
      sessionState.setReasoning('fast');
      expect(sessionState.reasoningDescription()).toContain('shallow');
      
      sessionState.setReasoning('thorough');
      expect(sessionState.reasoningDescription()).toContain('exhaustive');
    });
  });

  describe('Mentions', () => {
    it('should add mention', () => {
      sessionState.addMention('src/index.ts');
      const mentions = sessionState.getMentions();
      expect(mentions).toContain('src/index.ts');
    });

    it('should add multiple mentions', () => {
      sessionState.addMention('src/index.ts');
      sessionState.addMention('src/utils.ts');
      const mentions = sessionState.getMentions();
      expect(mentions.length).toBe(2);
      expect(mentions).toContain('src/index.ts');
      expect(mentions).toContain('src/utils.ts');
    });

    it('should clear mentions', () => {
      sessionState.addMention('src/index.ts');
      sessionState.clearMentions();
      expect(sessionState.getMentions()).toEqual([]);
    });

    it('should ignore empty mentions', () => {
      sessionState.addMention('');
      sessionState.addMention('   ');
      expect(sessionState.getMentions()).toEqual([]);
    });
  });

  describe('Model Name', () => {
    it('should return model name', () => {
      const state = new SessionState('custom-model');
      expect(state.getModelName()).toBe('custom-model');
    });
  });

  describe('Custom System Instruction', () => {
    it('should store custom system instruction', () => {
      const state = new SessionState('model', 'Custom instruction');
      expect(state.customSystemInstruction).toBe('Custom instruction');
    });
  });
});

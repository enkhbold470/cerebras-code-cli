import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { REPL } from '../src/repl.js';
import { AgenticLoop } from '../src/agent/loop.js';
import { SessionState } from '../src/session/state.js';
import { SessionTracker } from '../src/session/tracker.js';
import { CerebrasClient } from '../src/cerebras-client.js';
import { QuotaTracker } from '../src/quota-tracker.js';
import { AVAILABLE_MODELS } from '../src/models.js';

// Mock readline
vi.mock('readline', () => ({
  createInterface: vi.fn(),
}));

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    cyan: vi.fn((str) => str),
    green: vi.fn((str) => str),
    gray: vi.fn((str) => str),
    yellow: vi.fn((str) => str),
    red: vi.fn((str) => str),
  },
}));

describe('REPL', () => {
  let mockAgent: AgenticLoop;
  let mockSessionState: SessionState;
  let mockTracker: SessionTracker;
  let mockClient: CerebrasClient;
  let mockQuotaTracker: QuotaTracker;
  let mockRl: any;
  let repl: REPL;

  beforeEach(async () => {
    // Create mocks
    mockAgent = {
      reset: vi.fn(),
      updateClient: vi.fn(),
    } as any;

    mockSessionState = new SessionState('test-model');

    mockTracker = {
      buildSummary: vi.fn().mockReturnValue('Session summary'),
      getToolCounts: vi.fn().mockReturnValue({}),
      getApiCalls: vi.fn().mockReturnValue(0),
    } as any;

    mockClient = {} as any;
    mockQuotaTracker = new QuotaTracker(AVAILABLE_MODELS['qwen-3-235b-a22b-instruct-2507']);

    // Mock readline interface
    mockRl = {
      on: vi.fn(),
      prompt: vi.fn(),
      close: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };

    // Mock readline.createInterface
    const readline = await import('readline');
    const readlineMock = vi.mocked(readline);
    readlineMock.createInterface.mockReturnValue(mockRl);

    repl = new REPL(mockAgent, () => 'test prompt', mockSessionState, mockTracker, mockClient, mockQuotaTracker);
    // Manually set rl for testing
    (repl as any).rl = mockRl;
  });

  describe('constructor', () => {
    it('should initialize with all required parameters', () => {
      expect(repl).toBeDefined();
    });

    it('should work without quota tracker', () => {
      const replWithoutQuota = new REPL(mockAgent, () => 'test prompt', mockSessionState, mockTracker, mockClient);
      expect(replWithoutQuota).toBeDefined();
    });
  });

  describe('handleInput', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should prompt after empty input', async () => {
      await repl['handleInput']('   ');

      expect(mockRl.prompt).toHaveBeenCalled();
    });

    it('should handle exit command', async () => {
      await repl['handleInput']('exit');

      expect(mockRl.close).toHaveBeenCalled();
    });

    it('should handle quit command', async () => {
      await repl['handleInput']('quit');

      expect(mockRl.close).toHaveBeenCalled();
    });

    it('should handle clear command', async () => {
      await repl['handleInput']('clear');

      expect(mockAgent.reset).toHaveBeenCalledWith('test prompt');
      expect(mockRl.prompt).toHaveBeenCalled();
    });

    it('should handle help command', async () => {
      // Mock console.log to capture output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await repl['handleInput']('help');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Agent Help')
      );
      expect(mockRl.prompt).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle slash commands', async () => {
      const executeSpy = vi.spyOn(repl as any, 'executeSlashCommandAsync').mockResolvedValue();

      await repl['handleInput']('/status');

      expect(executeSpy).toHaveBeenCalledWith('/status');
      // Note: prompt is not called immediately for slash commands
    });

    it('should handle agent input', async () => {
      const processSpy = vi.spyOn(repl as any, 'processInputAsync').mockResolvedValue();

      await repl['handleInput']('hello agent');

      expect(processSpy).toHaveBeenCalledWith('hello agent');
      expect(mockRl.prompt).toHaveBeenCalled();
    });
  });

  describe('showCommandPreview', () => {
    it('should display available commands', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      repl['showCommandPreview']();

      expect(consoleSpy).toHaveBeenCalledWith('\nAvailable Slash Commands:');
      expect(consoleSpy).toHaveBeenCalledWith('Available Text Commands:');

      // Check that specific commands are shown
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('/init')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('/status')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('help')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('clear')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('handleSlashCommand', () => {
    it('should handle /status command', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const printStatusSpy = vi.spyOn(repl as any, 'printStatus');

      const result = await repl['handleSlashCommand']('/status');

      expect(result).toBe(false); // Should not exit
      expect(printStatusSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle /quit command', async () => {
      const result = await repl['handleSlashCommand']('/quit');

      expect(result).toBe(true); // Should exit
    });

    it('should handle unknown commands', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await repl['handleSlashCommand']('/unknown');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown slash command: /unknown')
      );

      consoleSpy.mockRestore();
    });

    it('should show command preview for just "/"', async () => {
      const showPreviewSpy = vi.spyOn(repl as any, 'showCommandPreview');

      const result = await repl['handleSlashCommand']('/');

      expect(result).toBe(false);
      expect(showPreviewSpy).toHaveBeenCalled();
    });
  });

  describe('printStatus', () => {
    it('should display session status', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      repl['printStatus']();

      expect(consoleSpy).toHaveBeenCalledWith('\nCurrent session status:\n');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Model:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reasoning:')
      );

      consoleSpy.mockRestore();
    });

    it('should show quota usage when quota tracker is available', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      repl['printStatus']();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Quota usage:')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('configureModel (reasoning)', () => {
    it('should update reasoning mode', async () => {
      const inquirerMock = vi.mocked(await import('inquirer'));
      inquirerMock.default.prompt.mockResolvedValue({ reasoning: 'thorough' });

      await repl['configureReasoning']();

      expect(mockSessionState.getReasoning()).toBe('thorough');
    });
  });

  describe('switchModel', () => {
    it('should handle model switching', async () => {
      const inquirerMock = vi.mocked(await import('inquirer'));
      inquirerMock.default.prompt.mockResolvedValue({ modelName: 'llama3.1-8b' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await repl['switchModel']();

      expect(mockSessionState.getModelName()).toBe('llama3.1-8b');
      expect(mockAgent.updateClient).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓ Model switched to llama3.1-8b')
      );

      consoleSpy.mockRestore();
    });

    it('should handle same model selection', async () => {
      const inquirerMock = vi.mocked(await import('inquirer'));
      inquirerMock.default.prompt.mockResolvedValue({ modelName: 'test-model' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await repl['switchModel']();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Model is already set to test-model')
      );

      consoleSpy.mockRestore();
    });
  });
});

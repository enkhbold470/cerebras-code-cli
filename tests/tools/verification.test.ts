import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { FileManager } from '../../src/file-manager.js';
import { toolDefinitions } from '../../src/tools/definitions.js';
import type { ToolExecuteContext } from '../../src/tools/types.js';

const execAsync = promisify(exec);

// Mock exec to avoid actual command execution in tests
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

describe('Verification Tools', () => {
  let fileManager: FileManager;
  let ctx: ToolExecuteContext;

  beforeEach(() => {
    fileManager = new FileManager();
    ctx = {
      fileManager,
      projectRoot: process.cwd(),
    };
  });

  describe('verify_type_check', () => {
    it('should return success when type check passes', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_type_check');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        callback?.(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await tool!.execute({ path: 'src/index.ts' }, ctx);
      expect(result).toContain('✅');
      expect(result).toContain('Type check passed');
    });

    it('should return errors when type check fails', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_type_check');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        callback?.({ stdout: '', stderr: 'error TS2322' } as any, null);
        return {} as any;
      });

      const result = await tool!.execute({ path: 'src/index.ts' }, ctx);
      expect(result).toContain('❌');
      expect(result).toContain('Type check failed');
    });

    it('should check entire project when path not provided', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_type_check');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        expect(command).toContain('tsc --noEmit');
        expect(command).not.toContain('src/index.ts');
        callback?.(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      await tool!.execute({}, ctx);
    });
  });

  describe('verify_lint', () => {
    it('should auto-fix by default', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_lint');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        expect(command).toContain('--fix');
        callback?.(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      await tool!.execute({ path: 'src/index.ts' }, ctx);
    });

    it('should not fix when fix is false', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_lint');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        expect(command).not.toContain('--fix');
        callback?.(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      await tool!.execute({ path: 'src/index.ts', fix: false }, ctx);
    });

    it('should return success when lint passes', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_lint');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        callback?.(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await tool!.execute({ path: 'src/index.ts' }, ctx);
      expect(result).toContain('✅');
      expect(result).toContain('Lint check passed');
    });
  });

  describe('verify_format', () => {
    it('should format by default', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_format');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        expect(command).toContain('--write');
        expect(command).not.toContain('--check');
        callback?.(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      await tool!.execute({ path: 'src/index.ts' }, ctx);
    });

    it('should only check when check is true', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_format');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        expect(command).toContain('--check');
        expect(command).not.toContain('--write');
        callback?.(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      await tool!.execute({ path: 'src/index.ts', check: true }, ctx);
    });
  });

  describe('verify_test', () => {
    it('should run tests for specific file', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_test');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        expect(command).toContain('src/index.test.ts');
        callback?.(null, { stdout: 'Tests passed', stderr: '' });
        return {} as any;
      });

      const result = await tool!.execute({ path: 'src/index.test.ts' }, ctx);
      expect(result).toContain('Test results');
    });

    it('should run all tests when path not provided', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_test');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        expect(command).toBe('npm test');
        callback?.(null, { stdout: '', stderr: '' });
        return {} as any;
      });

      await tool!.execute({}, ctx);
    });

    it('should handle test failures', async () => {
      const tool = toolDefinitions.find(t => t.name === 'verify_test');
      expect(tool).toBeDefined();

      vi.mocked(exec).mockImplementation((command, options, callback) => {
        callback?.({ stdout: '', stderr: 'Test failed' } as any, null);
        return {} as any;
      });

      const result = await tool!.execute({}, ctx);
      expect(result).toContain('❌');
      expect(result).toContain('Tests failed');
    });
  });
});

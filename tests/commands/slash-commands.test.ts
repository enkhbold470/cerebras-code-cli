import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SlashCommandLoader } from '../../src/commands/slash-commands.js';
import { CommandRegistry } from '../../src/commands/registry.js';

describe('SlashCommandLoader', () => {
  let testDir: string;
  let commandsDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cerebras-commands-test-${Date.now()}`);
    commandsDir = join(testDir, 'commands');
    await mkdir(commandsDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('loadCommands', () => {
    it('should return empty map when commands directory does not exist', async () => {
      const loader = new SlashCommandLoader(join(testDir, 'nonexistent'));
      const commands = await loader.loadCommands();
      expect(commands.size).toBe(0);
    });

    it('should load command from markdown file', async () => {
      const commandContent = `# Test Command
This is a test command.`;
      
      await writeFile(join(commandsDir, 'test.md'), commandContent);
      
      const loader = new SlashCommandLoader(commandsDir);
      const commands = await loader.loadCommands();
      
      expect(commands.size).toBe(1);
      const command = commands.get('test');
      expect(command).toBeDefined();
      expect(command?.name).toBe('test');
      expect(command?.content).toContain('Test Command');
    });

    it('should parse frontmatter metadata', async () => {
      const commandContent = `---
allowed-tools: 
  - Edit
  - Bash(npm:*)
model: claude-sonnet-4
hints: Generate tests
---
# Test Command
Command content here.`;
      
      await writeFile(join(commandsDir, 'generate-tests.md'), commandContent);
      
      const loader = new SlashCommandLoader(commandsDir);
      const commands = await loader.loadCommands();
      
      const command = commands.get('generate-tests');
      expect(command).toBeDefined();
      expect(command?.allowedTools).toEqual(['Edit', 'Bash(npm:*)']);
      expect(command?.model).toBe('claude-sonnet-4');
      expect(command?.hints).toBe('Generate tests');
      expect(command?.content).toContain('Command content here');
    });

    it('should handle nested command files', async () => {
      const nestedDir = join(commandsDir, 'tools');
      await mkdir(nestedDir, { recursive: true });
      
      await writeFile(join(nestedDir, 'generate.md'), '# Nested Command');
      
      const loader = new SlashCommandLoader(commandsDir);
      const commands = await loader.loadCommands();
      
      expect(commands.size).toBe(1);
      const command = commands.get('tools-generate');
      expect(command).toBeDefined();
    });

    it('should ignore non-markdown files', async () => {
      await writeFile(join(commandsDir, 'test.txt'), 'Not a markdown file');
      await writeFile(join(commandsDir, 'test.md'), '# Markdown file');
      
      const loader = new SlashCommandLoader(commandsDir);
      const commands = await loader.loadCommands();
      
      expect(commands.size).toBe(1);
      expect(commands.has('test')).toBe(true);
    });
  });

  describe('executeCommand', () => {
    it('should replace $ARGUMENTS placeholder', async () => {
      const commandContent = `Generate tests for: $ARGUMENTS`;
      const command = {
        name: 'test',
        description: 'Test',
        content: commandContent,
        path: '',
      };
      
      const loader = new SlashCommandLoader();
      const result = await loader.executeCommand(command, ['src/index.ts'], {
        projectRoot: '/project',
        currentDir: '/project',
      });
      
      expect(result).toContain('src/index.ts');
      expect(result).not.toContain('$ARGUMENTS');
    });

    it('should replace $PROJECT_ROOT and $CURRENT_DIR', async () => {
      const commandContent = `Project: $PROJECT_ROOT\nDir: $CURRENT_DIR`;
      const command = {
        name: 'test',
        description: 'Test',
        content: commandContent,
        path: '',
      };
      
      const loader = new SlashCommandLoader();
      const result = await loader.executeCommand(command, [], {
        projectRoot: '/project',
        currentDir: '/project/src',
      });
      
      expect(result).toContain('/project');
      expect(result).toContain('/project/src');
    });
  });
});

describe('CommandRegistry', () => {
  let testDir: string;
  let commandsDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cerebras-registry-test-${Date.now()}`);
    commandsDir = join(testDir, 'commands');
    await mkdir(commandsDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  it('should load and register commands', async () => {
    await writeFile(join(commandsDir, 'test1.md'), '# Test 1');
    await writeFile(join(commandsDir, 'test2.md'), '# Test 2');
    
    const loader = new SlashCommandLoader(commandsDir);
    const registry = new CommandRegistry(loader);
    
    await registry.load();
    
    expect(registry.has('test1')).toBe(true);
    expect(registry.has('test2')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('should get command by name', async () => {
    await writeFile(join(commandsDir, 'test.md'), '# Test Command');
    
    const loader = new SlashCommandLoader(commandsDir);
    const registry = new CommandRegistry(loader);
    await registry.load();
    
    const command = registry.get('test');
    expect(command).toBeDefined();
    expect(command?.name).toBe('test');
  });

  it('should list all commands', async () => {
    await writeFile(join(commandsDir, 'cmd1.md'), '# Cmd 1');
    await writeFile(join(commandsDir, 'cmd2.md'), '# Cmd 2');
    
    const loader = new SlashCommandLoader(commandsDir);
    const registry = new CommandRegistry(loader);
    await registry.load();
    
    const commands = registry.list();
    expect(commands.length).toBe(2);
  });

  it('should return command names', async () => {
    await writeFile(join(commandsDir, 'alpha.md'), '# Alpha');
    await writeFile(join(commandsDir, 'beta.md'), '# Beta');
    
    const loader = new SlashCommandLoader(commandsDir);
    const registry = new CommandRegistry(loader);
    await registry.load();
    
    const names = registry.getNames();
    expect(names).toContain('alpha');
    expect(names).toContain('beta');
  });
});

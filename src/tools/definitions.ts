import { dirname, join } from 'path';
import { mkdir } from 'fs/promises';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import { minimatch } from 'minimatch';
import { diffLines } from 'diff';
import type { ToolDefinition } from './types.js';

const execAsync = promisify(execCb);
const DEFAULT_BASH_PATTERNS = [
  'npm*',
  'yarn*',
  'pnpm*',
  'npx*',
  'git status*',
  'git diff*',
  'git rev-parse*',
  'ls*',
  'pwd',
  'cat*',
  'node*',
  'tsc*',
  'tsx*',
  'python*',
  'pytest*',
  'go*',
];

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.cs',
  '.php',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.sh',
]);

function requireString(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new Error(`Expected non-empty string for ${field}`);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Expected numeric value for ${field}`);
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a text file relative to the project root.',
    inputSchema: {
      path: { description: 'Relative file path to read', required: true },
      start_line: { description: 'Optional 1-based start line for focused reading' },
      end_line: { description: 'Optional 1-based end line for focused reading' },
    },
    examples: ['{"path":"src/index.ts"}', '{"path":"README.md","start_line":1,"end_line":80}'],
    async execute(input, ctx) {
      const path = requireString(input.path, 'path');
      const content = await ctx.fileManager.readFile(path);
      const lines = content.split('\n');
      const start = input.start_line ? requireNumber(input.start_line, 'start_line') : 1;
      const end = input.end_line ? requireNumber(input.end_line, 'end_line') : lines.length;
      const slice = lines.slice(start - 1, end);
      return [
        `FILE: ${path}`,
        `LINES: ${start}-${Math.min(end, lines.length)}`,
        '```',
        slice.join('\n'),
        '```',
      ].join('\n');
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file with new content. Always provide the full desired content.',
    inputSchema: {
      path: { description: 'Relative file path to write', required: true },
      content: { description: 'Complete file content to write', required: true },
    },
    examples: ['{"path":"src/new-file.ts","content":"export const x = 1;"}'],
    async execute(input, ctx) {
      const path = requireString(input.path, 'path');
      const content = requireString(input.content, 'content');
      const absolute = join(ctx.projectRoot, path);
      let previous: string | null = null;
      try {
        previous = await ctx.fileManager.readFile(path);
      } catch {
        previous = null;
      }
      await mkdir(dirname(absolute), { recursive: true });
      await ctx.fileManager.writeFile(path, content);
      ctx.tracker?.recordFileChange(path, previous, content);
      const diff = diffLines(previous ?? '', content);
      const formatted = diff
        .flatMap((part) => {
          const prefix = part.added ? '+' : part.removed ? '-' : ' ';
          return part.value
            .replace(/\r/g, '')
            .split('\n')
            .filter((line, index, arr) => !(line === '' && index === arr.length - 1))
            .map((line) => `${prefix}${line}`);
        })
        .join('\n');

      return [
        `Wrote ${path} (${content.length} chars).`,
        '```diff',
        formatted || '(no textual changes)',
        '```',
      ].join('\n');
    },
  },
  {
    name: 'list_directory',
    description: 'List files within a directory to understand structure.',
    inputSchema: {
      path: { description: 'Directory path relative to project root', required: true },
      depth: { description: 'Optional depth (default 2)' },
    },
    examples: ['{"path":"src","depth":2}'],
    async execute(input, ctx) {
      const path = requireString(input.path, 'path');
      const depth = input.depth ? requireNumber(input.depth, 'depth') : 2;
      const pattern = path === '.' ? '**/*' : `${path.replace(/\/$/, '')}/**/*`;
      const files = await ctx.fileManager.listFiles(pattern);
      const limited = files
        .filter((file) => file.split('/').length - (path === '.' ? 0 : path.split('/').length) <= depth)
        .slice(0, 200);
      if (!limited.length) {
        return `No files found under ${path}`;
      }
      return [`Directory listing for ${path}:`, ...limited.map((f) => `- ${f}`)].join('\n');
    },
  },
  {
    name: 'search_text',
    description: 'Search for a string across text files to find references or usages.',
    inputSchema: {
      query: { description: 'Exact string to search for', required: true },
      glob: { description: 'Optional glob pattern to narrow files (e.g., src/**/*.ts)' },
      max_results: { description: 'Optional max matches (default 10)' },
    },
    examples: ['{"query":"AgenticLoop"}', '{"query":"TODO","glob":"src/**/*.ts","max_results":5}'],
    async execute(input, ctx) {
      const query = requireString(input.query, 'query');
      const globPattern = typeof input.glob === 'string' && input.glob.trim().length > 0 ? input.glob : '**/*';
      const max = input.max_results ? requireNumber(input.max_results, 'max_results') : 10;
      const files = await ctx.fileManager.listFiles(globPattern);
      const matches: string[] = [];

      for (const file of files) {
        if (matches.length >= max) break;
        const ext = file.includes('.') ? file.slice(file.lastIndexOf('.')).toLowerCase() : '';
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        const content = await ctx.fileManager.readFile(file);
        if (!content.includes(query)) continue;
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (matches.length >= max) return;
          if (line.includes(query)) {
            matches.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
      }

      if (!matches.length) {
        return `No matches for "${query}" using pattern "${globPattern}".`;
      }

      return [`Results for "${query}":`, ...matches].join('\n');
    },
  },
  {
    name: 'run_bash',
    description: 'Execute a safe shell command (npm, git status, ls, etc.). Returns stdout/stderr.',
    inputSchema: {
      command: { description: 'Command to execute', required: true },
    },
    examples: ['{"command":"npm run build"}', '{"command":"git status"}'],
    async execute(input, ctx) {
      const command = requireString(input.command, 'command');
      const allowed = DEFAULT_BASH_PATTERNS.some((pattern) => minimatch(command, pattern));
      if (!allowed) {
        throw new Error(
          `Command "${command}" is not allowed. Allowed patterns: ${DEFAULT_BASH_PATTERNS.join(', ')}`,
        );
      }
      const { stdout, stderr } = await execAsync(command, { cwd: ctx.projectRoot });
      return (stdout || '').concat(stderr || '').trim() || '(no output)';
    },
  },
  {
    name: 'verify_type_check',
    description: 'Run TypeScript type checking on a specific file or the entire project.',
    inputSchema: {
      path: { description: 'Optional file path to check (if omitted, checks entire project)', required: false },
    },
    examples: ['{"path":"src/index.ts"}', '{}'],
    async execute(input, ctx) {
      const path = input.path ? requireString(input.path, 'path') : '';
      const command = path ? `npx tsc --noEmit ${path}` : 'npx tsc --noEmit';
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: ctx.projectRoot });
        const output = (stdout || '').concat(stderr || '').trim();
        if (!output) {
          return '✅ Type check passed: No errors found.';
        }
        return `Type check results:\n${output}`;
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string };
        const output = (err.stdout || '').concat(err.stderr || '').trim();
        return `❌ Type check failed:\n${output}`;
      }
    },
  },
  {
    name: 'verify_lint',
    description: 'Run linter (ESLint) on a specific file or the entire project.',
    inputSchema: {
      path: { description: 'Optional file path to lint (if omitted, lints entire project)', required: false },
      fix: { description: 'Whether to auto-fix issues (default: true)', required: false },
    },
    examples: ['{"path":"src/index.ts","fix":true}', '{"path":"src/index.ts","fix":false}'],
    async execute(input, ctx) {
      const path = input.path ? requireString(input.path, 'path') : '';
      const fix = input.fix !== false; // Default to true
      const command = path
        ? `npx eslint ${fix ? '--fix' : ''} ${path}`
        : `npx eslint ${fix ? '--fix' : ''} .`;
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: ctx.projectRoot });
        const output = (stdout || '').concat(stderr || '').trim();
        if (!output) {
          return '✅ Lint check passed: No errors found.';
        }
        return `Lint results:\n${output}`;
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string };
        const output = (err.stdout || '').concat(err.stderr || '').trim();
        return `❌ Lint check failed:\n${output}`;
      }
    },
  },
  {
    name: 'verify_format',
    description: 'Check or format code using Prettier.',
    inputSchema: {
      path: { description: 'Optional file path to format (if omitted, formats entire project)', required: false },
      check: { description: 'Whether to only check formatting without fixing (default: false)', required: false },
    },
    examples: ['{"path":"src/index.ts"}', '{"path":"src/index.ts","check":true}'],
    async execute(input, ctx) {
      const path = input.path ? requireString(input.path, 'path') : '.';
      const check = input.check === true;
      const command = check ? `npx prettier --check ${path}` : `npx prettier --write ${path}`;
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: ctx.projectRoot });
        const output = (stdout || '').concat(stderr || '').trim();
        if (!output) {
          return check ? '✅ Format check passed: All files are formatted correctly.' : '✅ Code formatted successfully.';
        }
        return `Format results:\n${output}`;
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string };
        const output = (err.stdout || '').concat(err.stderr || '').trim();
        return `❌ Format check failed:\n${output}`;
      }
    },
  },
  {
    name: 'verify_test',
    description: 'Run tests for a specific file or the entire test suite.',
    inputSchema: {
      path: { description: 'Optional test file path to run (if omitted, runs all tests)', required: false },
    },
    examples: ['{"path":"src/index.test.ts"}', '{}'],
    async execute(input, ctx) {
      const path = input.path ? requireString(input.path, 'path') : '';
      const command = path ? `npm test -- ${path}` : 'npm test';
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: ctx.projectRoot });
        const output = (stdout || '').concat(stderr || '').trim();
        if (!output) {
          return '✅ Tests passed (no output).';
        }
        return `Test results:\n${output}`;
      } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string };
        const output = (err.stdout || '').concat(err.stderr || '').trim();
        return `❌ Tests failed:\n${output}`;
      }
    },
  },
];

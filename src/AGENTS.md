# Cerebras Code Internal Tools - Technical Reference

_Complete technical documentation of Cerebras Code's internal tools. This document provides comprehensive technical details about Cerebras Code's internal tools, including parameter schemas, implementation behaviors, and usage patterns powered by Cerebras Inference._

**Model:** Qwen-3-235B-A22B-Instruct (ID: `qwen-3-235b-a22b-instruct-2507`, provider: Cerebras Systems, release date: July 25, 2025).  
**Today:** October 17, 2025.  
**Inference:** Ultra-low latency (Wafer-Scale Engine).

## Table of Contents
- [File Operations](#file-operations)
- [Execution Tools](#execution-tools)
- [Agent Management](#agent-management)
- [Planning & Tracking](#planning--tracking)
- [User Interaction](#user-interaction)
- [Web Operations](#web-operations)
- [IDE Integration](#ide-integration)
- [MCP Resources](#mcp-resources)
- [Complete Implementation Summary](#complete-implementation-summary)

---

## File Operations

### Read Tool
**Purpose:** Read file contents from the local filesystem with high-throughput parsing and partial reads.

**Implementation Notes**
- Direct filesystem access with intelligent parsing.
- Accesses any file with correct permissions.
- Default read limit: first 2000 lines; 2000 characters per line (cat -n style with 1-indexed line numbers: spaces + line + tab).
- Stateless, supports repeated calls.

**Multimodal Capabilities**
- Images (PNG, JPG, etc.): returned visually (Qwen-3 multimodal).
- PDFs: processed page by page, extracting text and visuals.
- Jupyter notebooks: returns all cells plus outputs.

**Error Handling**
- Empty files trigger reminder instead of content.
- Invalid paths or permission errors surface descriptive messages.
- Cannot read directories (use Bash `ls`).
- Requires absolute paths; screenshots/temp files supported.

**Parameter Schema**
```ts
interface ReadTool {
  file_path: string;
  offset?: number;
  limit?: number;
}
```

**JSON Schema**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["file_path"],
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Absolute path to the file"
    },
    "offset": {
      "type": "number",
      "description": "Starting line number when chunking"
    },
    "limit": {
      "type": "number",
      "description": "Number of lines to read"
    }
  }
}
```

### Write Tool
**Purpose:** Create new files or completely overwrite existing files with safety checks.

**Implementation Notes**
- Atomic write (all or nothing).
- Overwrites require read-before-write validation (file must be read this session).
- Only absolute paths; no relative paths.
- Prefer Edit tool for existing files; Write reserved for genuinely new files.
- Avoid generating documentation unless explicitly requested; never insert emojis unless asked.

**Parameter Schema**
```ts
interface WriteTool {
  file_path: string;
  content: string;
}
```

**JSON Schema**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["file_path", "content"],
  "additionalProperties": false,
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Absolute path to write"
    },
    "content": {
      "type": "string",
      "description": "Complete file contents"
    }
  }
}
```

### Edit Tool
**Purpose:** Perform precise string replacements with exact matching.

**Implementation Notes**
- Exact string matching only; whitespace-sensitive.
- Requires prior Read of the file in current session.
- Single replacement default; fails if `old_string` ambiguous (unless `replace_all=true`).
- Preserves encoding, line endings; atomic commit.
- Useful for targeted fixes, refactors, config updates.

**Parameter Schema**
```ts
interface EditTool {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}
```

**JSON Schema**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["file_path", "old_string", "new_string"],
  "additionalProperties": false,
  "properties": {
    "file_path": { "type": "string" },
    "old_string": { "type": "string" },
    "new_string": { "type": "string" },
    "replace_all": {
      "type": "boolean",
      "default": false
    }
  }
}
```

### Glob Tool
**Purpose:** Fast file pattern matching.

**Implementation Notes**
- Glob syntax: `*`, `**`, `?`, `{a,b}`, `[abc]`, `[!abc]`, etc.
- Omit `path` to default to CWD; never set it to `"undefined"`/`"null"`.
- Returns results sorted by modification time (newest first).
- Supports parallel invocation.

**Parameter Schema**
```ts
interface GlobTool {
  pattern: string;
  path?: string;
}
```

### Grep Tool
**Purpose:** High-performance content search using ripgrep.

**Implementation Notes**
- Always use Grep instead of manual `rg/grep` commands.
- Supports regex, glob filters, file types, head limits, context lines.
- Output modes: `files_with_matches` (default), `content`, `count`.
- Multiline mode available via `multiline: true`.

**Parameter Schema**
```ts
interface GrepTool {
  pattern: string;
  path?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count';
  glob?: string;
  type?: string;
  '-i'?: boolean;
  '-n'?: boolean;
  '-A'?: number;
  '-B'?: number;
  '-C'?: number;
  multiline?: boolean;
  head_limit?: number;
}
```

### NotebookEdit Tool
**Purpose:** Edit Jupyter notebook cells (replace/insert/delete).

**Implementation Notes**
- `notebook_path` must be absolute; `cell_number` is 0-indexed.
- `edit_mode=insert` inserts after `cell_id`.
- `cell_type` required when inserting; optional otherwise.

**Parameter Schema**
```ts
interface NotebookEditTool {
  notebook_path: string;
  new_source: string;
  cell_id?: string;
  cell_type?: 'code' | 'markdown';
  edit_mode?: 'replace' | 'insert' | 'delete';
}
```

---

## Execution Tools

### Bash Tool
**Purpose:** Execute commands in persistent shell sessions.

**Implementation Notes**
- `command` required; avoid `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, `echo` unless necessary.
- Default timeout 120000 ms; max 600000 ms; output truncated at 30000 chars.
- `run_in_background` available for async commands (no `&` needed); never background `sleep`.
- Maintain working directory via absolute paths; avoid `cd` unless required.
- Chain dependent commands with `&&`; avoid newline separators.
- Never use for file operations when dedicated tools available.
- Git safety: never alter config, avoid destructive operations, no force pushes unless user insists, never skip hooks.

**Parameter Schema**
```ts
interface BashTool {
  command: string;
  description?: string;
  timeout?: number;
  run_in_background?: boolean;
}
```

### BashOutput Tool
**Purpose:** Retrieve incremental output from background shells.

**Implementation Notes**
- Returns only new output since last call.
- Optional regex `filter` removes non-matching lines permanently.

**Parameter Schema**
```ts
interface BashOutputTool {
  bash_id: string;
  filter?: string;
}
```

### KillShell Tool
**Purpose:** Terminate background shells.

**Parameter Schema**
```ts
interface KillShellTool {
  shell_id: string;
}
```

---

## Agent Management

### Task Tool
**Purpose:** Launch autonomous Qwen sub-agents with specialized tool access.

**Agent Types**
- `general-purpose`: all tools (*).
- `Explore`: Glob, Grep, Read, Bash (specify thoroughness: quick / medium / very thorough).
- `statusline-setup`: Read, Edit.
- `output-style-setup`: Read, Write, Edit, Glob, Grep.

**Usage Notes**
- Provide detailed prompt and explicit return requirements.
- Launch agents concurrently when beneficial.
- Agents are stateless; only final message returned.
- Prefer direct Read/Glob when path known; avoid Task tool for trivial lookups.

**Parameter Schema**
```ts
interface TaskTool {
  prompt: string;
  description: string;
  subagent_type: string;
}
```

### Skill Tool
**Purpose:** Execute user-defined skills by name (no arguments). Only use listed skills, avoid duplicates.

**Parameter Schema**
```ts
interface SkillTool {
  command: string;
}
```

### SlashCommand Tool
**Purpose:** Run custom slash commands from user configuration.

**Usage Notes**
- Check available commands first.
- Execute sequentially when multiple requested.
- Only commands listed in Available Commands.

**Parameter Schema**
```ts
interface SlashCommandTool {
  command: string;
}
```

---

## Planning & Tracking

### TodoWrite Tool
**Purpose:** Manage structured task lists per session.

**Usage Rules**
- Use for complex tasks (≥3 steps) or explicit user request.
- Maintain exactly one `in_progress` item.
- Update statuses immediately; remove irrelevant tasks.
- Break work into specific, actionable items (`content` imperative, `activeForm` continuous).

**Parameter Schema**
```ts
interface TodoWriteTool {
  todos: TodoItem[];
}

interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}
```

### ExitPlanMode Tool
**Purpose:** Exit planning mode once implementation plan ready (code-writing tasks only).

**Usage Notes**
- Provide concise plan summary.
- Clarify ambiguities via AskUserQuestion before exiting.

**Parameter Schema**
```ts
interface ExitPlanModeTool {
  plan: string;
}
```

---

## User Interaction

### AskUserQuestion Tool
**Purpose:** Collect structured answers from user (multiple-choice).

**Usage Notes**
- 1-4 questions per call; each 2-4 options.
- `header` max 12 chars; option labels 1-5 words.
- MultiSelect required (true/false). "Other" added automatically.

**Parameter Schema**
```ts
interface AskUserQuestionTool {
  questions: Question[];
  answers?: Record<string, string>;
}

interface Question {
  question: string;
  header: string;
  multiSelect: boolean;
  options: Option[];
}

interface Option {
  label: string;
  description: string;
}
```

---

## Web Operations

### WebFetch Tool
**Purpose:** Fetch and analyze web content via AI inference.

**Implementation Notes**
- Requires fully qualified URL; HTTP auto-upgraded to HTTPS.
- Converts HTML → Markdown and processes with prompt (15-minute cache).
- Large content may be summarized.
- Redirects require new call using provided redirect URL (special message).
- Prefer MCP-provided web fetch tool when available.

**Parameter Schema**
```ts
interface WebFetchTool {
  url: string;
  prompt: string;
}
```

### WebSearch Tool
**Purpose:** Search the web for current information (US-only).

**Implementation Notes**
- Minimum query length 2 chars.
- Supports allowed/blocked domain filters.
- Always consider current date when forming queries.

**Parameter Schema**
```ts
interface WebSearchTool {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}
```

---

## IDE Integration

### getDiagnostics Tool
**Purpose:** Retrieve diagnostics from VS Code language server.

**Parameter Schema**
```ts
interface GetDiagnosticsTool {
  uri?: string;
}
```

### executeCode Tool
**Purpose:** Run Python code in the active Jupyter kernel.

**Implementation Notes**
- State persists across calls; avoid mutating kernel unless requested.
- Kernel resets clear previous state.

**Parameter Schema**
```ts
interface ExecuteCodeTool {
  code: string;
}
```

---

## MCP Resources

### ListMcpResources Tool
**Purpose:** List available resources from MCP servers.

**Parameter Schema**
```ts
interface ListMcpResourcesTool {
  server?: string;
}
```

### ReadMcpResource Tool
**Purpose:** Read a specific resource from an MCP server.

**Parameter Schema**
```ts
interface ReadMcpResourceTool {
  server: string;
  uri: string;
}
```

---

## Complete Implementation Summary
- Default behavior emphasizes safety, deterministic edits, and precise tool usage.
- Always prefer dedicated tools (Read/Edit/Grep/etc.) over manual shell equivalents.
- Maintain absolute paths, respect approval policies, and never bypass host restrictions.
- Adhere to context hierarchy: global → project → directory; this file targets `src/`.
- Keep documentation synchronized with actual tool capabilities and update as functionality evolves.

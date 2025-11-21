import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { homedir } from 'os';

export interface SlashCommand {
  name: string;
  description: string;
  allowedTools?: string[];
  model?: string;
  hints?: string;
  content: string;
  path: string;
}

interface CommandMetadata {
  'allowed-tools'?: string[];
  model?: string;
  hints?: string;
}


/**
 * Loads slash commands from ~/.cerebras/commands/ directory
 * Commands are markdown files with optional frontmatter metadata
 */
export class SlashCommandLoader {
  private commandsDir: string;

  constructor(commandsDir?: string) {
    this.commandsDir = commandsDir || join(homedir(), '.cerebras', 'commands');
  }

  /**
   * Load all slash commands from the commands directory
   */
  async loadCommands(): Promise<Map<string, SlashCommand>> {
    const commands = new Map<string, SlashCommand>();

    if (!existsSync(this.commandsDir)) {
      return commands;
    }

    try {
      const files = await readdir(this.commandsDir, { recursive: true });
      const markdownFiles = files.filter(
        (f) => extname(f) === '.md' && !f.includes('node_modules'),
      );

      for (const file of markdownFiles) {
        const filePath = join(this.commandsDir, file);
        const command = await this.loadCommand(filePath);
        if (command) {
          commands.set(command.name, command);
        }
      }
    } catch (error) {
      // Silently fail if commands directory doesn't exist or can't be read
      console.warn(`Warning: Could not load slash commands from ${this.commandsDir}`);
    }

    return commands;
  }

  /**
   * Load a single command file
   */
  private async loadCommand(filePath: string): Promise<SlashCommand | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const { metadata, body } = this.parseFrontmatter(content);

      // Command name is the filename without extension
      const name = filePath
        .replace(this.commandsDir + '/', '')
        .replace(/\.md$/, '')
        .replace(/\//g, '-');

      return {
        name,
        description: metadata.hints || `Custom command: ${name}`,
        allowedTools: metadata['allowed-tools'],
        model: metadata.model,
        hints: metadata.hints,
        content: body.trim(),
        path: filePath,
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse frontmatter from markdown file
   */
  private parseFrontmatter(content: string): {
    metadata: CommandMetadata;
    body: string;
  } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { metadata: {}, body: content };
    }

    const frontmatter = match[1];
    const body = match[2];

    const metadata: CommandMetadata = {};
    const lines = frontmatter.split('\n');
    let currentKey: string | null = null;
    const arrayValues: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) continue;

      // Check if this is an array item (starts with -)
      if (trimmed.startsWith('-')) {
        const value = trimmed.slice(1).trim();
        if (value) {
          arrayValues.push(value);
        }
        continue;
      }

      // Process accumulated array values
      if (currentKey && arrayValues.length > 0) {
        if (currentKey === 'allowed-tools') {
          metadata['allowed-tools'] = [...arrayValues];
        }
        arrayValues.length = 0;
        currentKey = null;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      if (key === 'allowed-tools') {
        // Check if value is empty (array follows) or has comma-separated values
        if (!value) {
          currentKey = 'allowed-tools';
        } else {
          metadata['allowed-tools'] = value.split(',').map((t) => t.trim()).filter(Boolean);
        }
      } else if (key === 'model') {
        metadata.model = value;
      } else if (key === 'hints') {
        // Handle multi-line hints
        if (value) {
          metadata.hints = value;
        } else {
          // Multi-line hint - collect until next key
          const hintLines: string[] = [];
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            if (nextLine && !nextLine.includes(':')) {
              hintLines.push(nextLine);
            } else {
              break;
            }
          }
          if (hintLines.length > 0) {
            metadata.hints = hintLines.join(' ');
          }
        }
      }
    }

    // Process any remaining array values
    if (currentKey && arrayValues.length > 0) {
      if (currentKey === 'allowed-tools') {
        metadata['allowed-tools'] = [...arrayValues];
      }
    }

    return { metadata, body };
  }

  /**
   * Execute a slash command with arguments
   */
  async executeCommand(
    command: SlashCommand,
    args: string[],
    context: {
      projectRoot: string;
      currentDir: string;
      [key: string]: unknown;
    },
  ): Promise<string> {
    // Replace $ARGUMENTS placeholder with actual arguments
    let content = command.content.replace(/\$ARGUMENTS/g, args.join(' '));

    // Replace other context variables
    content = content.replace(/\$PROJECT_ROOT/g, context.projectRoot);
    content = content.replace(/\$CURRENT_DIR/g, context.currentDir);

    // Replace bash command placeholders (e.g., `!pwd` -> execute and replace)
    const bashPlaceholderRegex = /!([^\n]+)/g;
    const bashMatches = Array.from(content.matchAll(bashPlaceholderRegex));

    for (const match of bashMatches) {
      const commandToRun = match[1].trim();
      // This would need to be executed via tool registry
      // For now, we'll leave placeholders as-is and let the agent handle them
    }

    return content;
  }
}

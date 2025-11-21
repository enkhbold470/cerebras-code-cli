import type { SlashCommand, SlashCommandLoader } from './slash-commands.js';

export class CommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();
  private loader: SlashCommandLoader;

  constructor(loader: SlashCommandLoader) {
    this.loader = loader;
  }

  /**
   * Load all commands from the filesystem
   */
  async load(): Promise<void> {
    this.commands = await this.loader.loadCommands();
  }

  /**
   * Get a command by name
   */
  get(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * List all available commands
   */
  list(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Check if a command exists
   */
  has(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * Get command names
   */
  getNames(): string[] {
    return Array.from(this.commands.keys());
  }
}

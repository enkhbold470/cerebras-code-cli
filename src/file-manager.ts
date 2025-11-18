import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import fg from 'fast-glob';

export class FileManager {
  private basePath: string;
  private excludedPaths: string[];

  constructor(basePath: string = process.cwd(), excludedPaths: string[] = []) {
    this.basePath = basePath;
    this.excludedPaths = [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      'lib/**',
      '*.log',
      ...excludedPaths,
    ];
  }

  async readFile(filePath: string): Promise<string> {
    const fullPath = join(this.basePath, filePath);
    return readFile(fullPath, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = join(this.basePath, filePath);
    await writeFile(fullPath, content, 'utf-8');
  }

  async listFiles(pattern = '**/*'): Promise<string[]> {
    const files = await glob(pattern, {
      cwd: this.basePath,
      ignore: this.excludedPaths,
      nodir: true,
    });
    return files;
  }

  async getProjectStructure(): Promise<string> {
    const files = (await fg('**/*', {
      cwd: this.basePath,
      ignore: this.excludedPaths,
      dot: false,
      onlyFiles: true,
      unique: true,
    })) as string[];
    return this.buildTree(files);
  }

  private buildTree(files: string[]): string {
    const sorted = files.sort();
    let tree = 'Project Structure:\n';

    for (const file of sorted.slice(0, 100)) {
      const parts = file.split('/');
      const depth = parts.length - 1;
      const indent = ' '.repeat(depth * 2);
      const name = parts[parts.length - 1];
      tree += `${indent}├── ${name}\n`;
    }

    if (sorted.length > 100) {
      tree += `\n... and ${sorted.length - 100} more files`;
    }

    return tree;
  }
}

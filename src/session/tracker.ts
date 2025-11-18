type ToolCounts = Record<string, number>;

function diffLines(before: string | null, after: string): { added: number; removed: number } {
  if (before === null) {
    return { added: after.split('\n').length, removed: 0 };
  }
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  return {
    added: Math.max(afterLines.length - beforeLines.length, 0),
    removed: Math.max(beforeLines.length - afterLines.length, 0),
  };
}

export class SessionTracker {
  private readonly startedAt = Date.now();
  private apiDurationMs = 0;
  private apiCalls = 0;
  private toolCounts: ToolCounts = {};
  private filesChanged = new Set<string>();
  private linesAdded = 0;
  private linesRemoved = 0;

  getWallDurationMs(): number {
    return Date.now() - this.startedAt;
  }

  getApiDurationMs(): number {
    return this.apiDurationMs;
  }

  getApiCalls(): number {
    return this.apiCalls;
  }

  getToolCounts(): ToolCounts {
    return { ...this.toolCounts };
  }

  getFileChangeStats(): { filesChanged: number; linesAdded: number; linesRemoved: number } {
    return {
      filesChanged: this.filesChanged.size,
      linesAdded: this.linesAdded,
      linesRemoved: this.linesRemoved,
    };
  }

  recordApiCall(durationMs: number): void {
    this.apiCalls += 1;
    this.apiDurationMs += durationMs;
  }

  recordToolCall(name: string): void {
    this.toolCounts[name] = (this.toolCounts[name] || 0) + 1;
  }

  recordFileChange(path: string, before: string | null, after: string): void {
    this.filesChanged.add(path);
    const diff = diffLines(before, after);
    this.linesAdded += diff.added;
    this.linesRemoved += diff.removed;
  }

  buildSummary(modelName: string): string {
    const wallMs = Date.now() - this.startedAt;
    const formatMs = (ms: number) => (ms / 1000).toFixed(1) + 's';
    const toolSummary = Object.entries(this.toolCounts)
      .map(([name, count]) => `    ${name}: ${count}`)
      .join('\n');

    return [
      'Session summary:',
      `  Total cost:            $0.0000 (Cerebras API usage not reported)`,
      `  Total duration (API):  ${formatMs(this.apiDurationMs)}`,
      `  Total duration (wall): ${(wallMs / 1000).toFixed(1)}s`,
      `  Total code changes:    ${this.linesAdded} lines added, ${this.linesRemoved} lines removed`,
      `  Files changed:         ${this.filesChanged.size}`,
      '  Usage by model:',
      `    ${modelName}:  ${this.apiCalls} call(s), token metrics unavailable`,
      toolSummary ? `  Tool usage:\n${toolSummary}` : '  Tool usage: none',
    ].join('\n');
  }
}

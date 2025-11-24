export type ApprovalSubject = 'write_file' | 'run_bash';
export type ReasoningMode = 'fast' | 'balanced' | 'thorough';
export type PermissionMode = 'interactive' | 'auto-accept' | 'yolo';

const REASONING_DESCRIPTIONS: Record<ReasoningMode, string> = {
  fast: 'Use shallow reasoning passes to minimize latency; prefer single tool calls when safe.',
  balanced: 'Use a balanced approach between speed and rigor.',
  thorough: 'Use exhaustive reasoning with multi-step plans and redundant verification when feasible.',
};

export class SessionState {
  private approvalAuto: Record<ApprovalSubject, boolean> = {
    write_file: false,
    run_bash: false,
  };

  private reasoning: ReasoningMode = 'balanced';
  private permissionMode: PermissionMode = 'interactive';
  private mentions = new Set<string>();
  private modelName: string;
  readonly customSystemInstruction?: string;

  constructor(modelName: string, customSystemInstruction?: string) {
    this.modelName = modelName;
    this.customSystemInstruction = customSystemInstruction;
  }

  setModelName(modelName: string): void {
    this.modelName = modelName;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
    // Auto-approve all in YOLO mode
    if (mode === 'yolo') {
      this.approvalAuto.write_file = true;
      this.approvalAuto.run_bash = true;
    }
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  isYoloMode(): boolean {
    return this.permissionMode === 'yolo';
  }

  getModelName(): string {
    return this.modelName;
  }

  setApproval(subject: ApprovalSubject, autoApprove: boolean): void {
    this.approvalAuto[subject] = autoApprove;
  }

  setApprovals(map: Partial<Record<ApprovalSubject, boolean>>): void {
    (Object.keys(map) as ApprovalSubject[]).forEach((key) => {
      const value = map[key];
      if (typeof value === 'boolean') {
        this.approvalAuto[key] = value;
      }
    });
  }

  isAutoApproved(subject: ApprovalSubject): boolean {
    return this.approvalAuto[subject];
  }

  approvalsSummary(): string {
    const entries = [
      `write_file: ${this.approvalAuto.write_file ? 'auto' : 'ask'}`,
      `run_bash: ${this.approvalAuto.run_bash ? 'auto' : 'ask'}`,
    ];
    return entries.join(', ');
  }

  setReasoning(mode: ReasoningMode): void {
    this.reasoning = mode;
  }

  getReasoning(): ReasoningMode {
    return this.reasoning;
  }

  reasoningDescription(): string {
    return REASONING_DESCRIPTIONS[this.reasoning];
  }

  addMention(path: string): void {
    const normalized = path.trim();
    if (normalized.length === 0) return;
    this.mentions.add(normalized);
  }

  clearMentions(): void {
    this.mentions.clear();
  }

  getMentions(): string[] {
    return Array.from(this.mentions);
  }
}

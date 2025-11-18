import type { ProjectConfig } from '../types.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { SessionState } from '../session/state.js';

const LOOP_INSTRUCTIONS = `
You operate like Claude Code's agentic loop:
1. Gather context (inspect files, configs, history).
2. Plan explicit steps before editing (share a short numbered list).
3. Execute using tools (read/write files, list directories, run allowed bash commands).
4. Verify by rerunning relevant commands or comparing diffs.
5. Iterate until the user goal is satisfied or blocked.

Always keep changes minimal, deterministic, and reversible. Prefer editing existing files over creating new ones unless necessary.
`;

const RESPONSE_POLICY = `
Response format:
- When you need tools, respond ONLY with JSON: {"tool_calls":[{"id":"call-1","name":"read_file","input":{"path":"src/index.ts"}}]}
- Each tool call must include a stable id, tool name, and input object.
- After tools return results, incorporate them and continue reasoning.
- When you are ready to answer the user, respond ONLY with JSON: {"final_response":"concise answer here"}.
- Never emit raw HTML instructions or step-by-step IDE directions. Communicate as an autonomous coding agent.
- Keep final responses short (<= 200 words) and include verification notes (tests run, files changed).
`;

export function buildSystemPrompt(
  registry: ToolRegistry,
  projectConfig: ProjectConfig,
  sessionState: SessionState,
): string {
  const projectInstructions = projectConfig.instructions
    ? `Project-specific instructions:\n${projectConfig.instructions}\n`
    : '';

  const toolsOverview = `Available tools:\n${registry.listSummaries()}`;

  const supplemental = sessionState.customSystemInstruction
    ? `Additional user instructions:\n${sessionState.customSystemInstruction}\n`
    : '';

  const reasoning = `Reasoning preference (${sessionState.getReasoning()}): ${sessionState.reasoningDescription()}`;
  const mentions = sessionState.getMentions();
  const mentionBlock = mentions.length
    ? `Focus files:\n${mentions.map((path) => `- ${path}`).join('\n')}\n`
    : '';
  const approvals = `Tool approval policy (enforced by CLI): ${sessionState.approvalsSummary()}. Do not attempt to bypass host restrictions.`;

  return [
    'You are Cerebras CLI Agent, a Claude Code-style AI pair programmer with direct tool access.',
    LOOP_INSTRUCTIONS.trim(),
    toolsOverview,
    reasoning,
    approvals,
    mentionBlock.trim(),
    RESPONSE_POLICY.trim(),
    projectInstructions.trim(),
    supplemental.trim(),
    'Always cite the tools you used in the final summary (e.g., read_file(src/index.ts), run_bash(npm run build)).',
  ]
    .filter(Boolean)
    .join('\n\n');
}

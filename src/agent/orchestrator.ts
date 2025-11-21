import { AgenticLoop } from './loop.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { CerebrasClient } from '../cerebras-client.js';
import { buildSystemPrompt } from './system-prompt.js';
import type { ProjectConfig } from '../types.js';
import type { SessionState } from '../session/state.js';

export interface SubagentConfig {
  name: string;
  role: string;
  context: string;
  tools?: string[];
}

export interface OrchestrationPlan {
  tasks: Array<{
    id: string;
    description: string;
    assignedAgent: string;
    dependencies: string[];
  }>;
}

/**
 * Multi-agent orchestrator for delegating tasks to specialist agents
 */
export class AgentOrchestrator {
  private subagents: Map<string, SubagentConfig> = new Map();
  private mainAgent: AgenticLoop;
  private client: CerebrasClient;
  private toolRegistry: ToolRegistry;
  private projectConfig: ProjectConfig;
  private sessionState: SessionState;

  constructor(
    mainAgent: AgenticLoop,
    client: CerebrasClient,
    toolRegistry: ToolRegistry,
    projectConfig: ProjectConfig,
    sessionState: SessionState,
  ) {
    this.mainAgent = mainAgent;
    this.client = client;
    this.toolRegistry = toolRegistry;
    this.projectConfig = projectConfig;
    this.sessionState = sessionState;
  }

  /**
   * Register a subagent
   */
  registerSubagent(config: SubagentConfig): void {
    this.subagents.set(config.name, config);
  }

  /**
   * Create an orchestration plan from a user request
   */
  async createPlan(userRequest: string): Promise<OrchestrationPlan> {
    const prompt = `Break down the following request into discrete tasks and assign them to specialist agents:

Request: ${userRequest}

Available agents:
${Array.from(this.subagents.values())
  .map((a) => `- ${a.name}: ${a.role}`)
  .join('\n')}

Respond with a JSON plan:
{
  "tasks": [
    {
      "id": "task-1",
      "description": "Task description",
      "assignedAgent": "agent-name",
      "dependencies": []
    }
  ]
}`;

    const response = await this.mainAgent.run(prompt);
    
    // Parse JSON from response
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as OrchestrationPlan;
      }
    } catch {
      // Fallback: create simple plan
    }

    // Fallback plan
    return {
      tasks: [
        {
          id: 'task-1',
          description: userRequest,
          assignedAgent: 'main',
          dependencies: [],
        },
      ],
    };
  }

  /**
   * Execute an orchestration plan
   */
  async executePlan(plan: OrchestrationPlan): Promise<string> {
    const results: Array<{ taskId: string; result: string }> = [];

    // Execute tasks in dependency order
    const executed = new Set<string>();
    
    while (executed.size < plan.tasks.length) {
      const readyTasks = plan.tasks.filter(
        (task) =>
          !executed.has(task.id) &&
          task.dependencies.every((dep) => executed.has(dep)),
      );

      if (readyTasks.length === 0) {
        throw new Error('Circular dependency detected in orchestration plan');
      }

      for (const task of readyTasks) {
        const result = await this.executeTask(task);
        results.push({ taskId: task.id, result });
        executed.add(task.id);
      }
    }

    // Summarize results
    return results.map((r) => `Task ${r.taskId}: ${r.result}`).join('\n\n');
  }

  /**
   * Execute a single task with appropriate agent
   */
  private async executeTask(task: OrchestrationPlan['tasks'][0]): Promise<string> {
    if (task.assignedAgent === 'main') {
      return this.mainAgent.run(task.description);
    }

    const subagent = this.subagents.get(task.assignedAgent);
    if (!subagent) {
      return this.mainAgent.run(task.description);
    }

    // Create specialized agent with subagent context
    const subagentPrompt = buildSystemPrompt(
      this.toolRegistry,
      {
        ...this.projectConfig,
        instructions: `${subagent.context}\n\n${this.projectConfig.instructions || ''}`,
      },
      this.sessionState,
    );

    const subagentLoop = new AgenticLoop(this.client, this.toolRegistry, subagentPrompt);
    return subagentLoop.run(task.description);
  }
}

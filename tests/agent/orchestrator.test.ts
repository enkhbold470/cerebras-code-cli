import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../../src/agent/orchestrator.js';
import { AgenticLoop } from '../../src/agent/loop.js';
import type { CerebrasClient } from '../../src/cerebras-client.js';
import type { ToolRegistry } from '../../src/tools/registry.js';
import type { ProjectConfig } from '../../src/types.js';
import { SessionState } from '../../src/session/state.js';

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;
  let mockMainAgent: AgenticLoop;
  let mockClient: CerebrasClient;
  let mockToolRegistry: ToolRegistry;
  let projectConfig: ProjectConfig;
  let sessionState: SessionState;

  beforeEach(() => {
    mockMainAgent = {
      run: vi.fn().mockResolvedValue('Task completed'),
    } as any;

    mockClient = {} as any;
    mockToolRegistry = {} as any;
    projectConfig = {};
    sessionState = new SessionState('test-model');

    orchestrator = new AgentOrchestrator(
      mockMainAgent,
      mockClient,
      mockToolRegistry,
      projectConfig,
      sessionState,
    );
  });

  describe('registerSubagent', () => {
    it('should register a subagent', () => {
      const config = {
        name: 'architect',
        role: 'Design data models',
        context: 'Focus on architecture',
      };

      orchestrator.registerSubagent(config);
      // Can't directly access private subagents, but we can test via createPlan
      expect(() => orchestrator.registerSubagent(config)).not.toThrow();
    });
  });

  describe('createPlan', () => {
    it('should create a plan from user request', async () => {
      vi.mocked(mockMainAgent.run).mockResolvedValue(JSON.stringify({
        tasks: [
          {
            id: 'task-1',
            description: 'Design schema',
            assignedAgent: 'architect',
            dependencies: [],
          },
        ],
      }));

      const plan = await orchestrator.createPlan('Build user feature');
      
      expect(plan.tasks.length).toBeGreaterThan(0);
      expect(mockMainAgent.run).toHaveBeenCalled();
    });

    it('should create fallback plan when JSON parsing fails', async () => {
      vi.mocked(mockMainAgent.run).mockResolvedValue('Invalid response');

      const plan = await orchestrator.createPlan('Build feature');
      
      expect(plan.tasks.length).toBe(1);
      expect(plan.tasks[0].assignedAgent).toBe('main');
    });
  });

  describe('executePlan', () => {
    it('should execute tasks in dependency order', async () => {
      const plan = {
        tasks: [
          {
            id: 'task-1',
            description: 'Task 1',
            assignedAgent: 'main',
            dependencies: [],
          },
          {
            id: 'task-2',
            description: 'Task 2',
            assignedAgent: 'main',
            dependencies: ['task-1'],
          },
        ],
      };

      vi.mocked(mockMainAgent.run).mockResolvedValue('Completed');

      const result = await orchestrator.executePlan(plan);
      
      expect(result).toContain('task-1');
      expect(result).toContain('task-2');
      expect(mockMainAgent.run).toHaveBeenCalledTimes(2);
    });

    it('should execute independent tasks in parallel order', async () => {
      const plan = {
        tasks: [
          {
            id: 'task-1',
            description: 'Task 1',
            assignedAgent: 'main',
            dependencies: [],
          },
          {
            id: 'task-2',
            description: 'Task 2',
            assignedAgent: 'main',
            dependencies: [],
          },
        ],
      };

      vi.mocked(mockMainAgent.run).mockResolvedValue('Completed');

      await orchestrator.executePlan(plan);
      
      expect(mockMainAgent.run).toHaveBeenCalledTimes(2);
    });

    it('should throw error on circular dependencies', async () => {
      const plan = {
        tasks: [
          {
            id: 'task-1',
            description: 'Task 1',
            assignedAgent: 'main',
            dependencies: ['task-2'],
          },
          {
            id: 'task-2',
            description: 'Task 2',
            assignedAgent: 'main',
            dependencies: ['task-1'],
          },
        ],
      };

      await expect(orchestrator.executePlan(plan)).rejects.toThrow('Circular dependency');
    });
  });
});

/**
 *   GET /v1/sessions/{session_id}/agent-profiles
 */

import { z } from 'zod';

export const agentProfileDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  when_to_use: z.string().optional(),
  /** Tool allowlist (exact builtin names + `mcp__` globs); absent = every tool. */
  tools: z.array(z.string()).optional(),
  disallowed_tools: z.array(z.string()).optional(),
  /** Subagent profile names this agent may delegate to; absent = any type. */
  subagents: z.array(z.string()).optional(),
  model_preference: z.enum(['primary', 'secondary']).optional(),
});
export type AgentProfileDescriptor = z.infer<typeof agentProfileDescriptorSchema>;

export const listAgentProfilesResponseSchema = z.object({
  profiles: z.array(agentProfileDescriptorSchema),
});
export type ListAgentProfilesResponse = z.infer<typeof listAgentProfilesResponseSchema>;

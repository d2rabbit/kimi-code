/**
 *   GET    /v1/sessions/{session_id}/cron
 *     Response data: `{ tasks: CronTask[] }`
 *     Errors: 40401 session.not_found
 *
 *   POST   /v1/sessions/{session_id}/cron
 *     Body: `{ cron, prompt, recurring? }`
 *     Response data: `{ task: CronTask }`
 *     Errors: 40001 validation.failed, 40401 session.not_found
 *
 *   DELETE /v1/sessions/{session_id}/cron/{task_id}
 *     Response data: `{ deleted: boolean }` (false when the task is absent — idempotent)
 *     Errors: 40401 session.not_found
 */

import { z } from 'zod';

export const cronTaskSchema = z.object({
  id: z.string().min(1),
  /** 5-field cron expression (minute hour day-of-month month day-of-week). */
  cron: z.string().min(1),
  prompt: z.string(),
  /** Unix epoch milliseconds. */
  created_at: z.number(),
  recurring: z.boolean().optional(),
  /** Unix epoch milliseconds; absent when never fired. */
  last_fired_at: z.number().optional(),
});
export type CronTask = z.infer<typeof cronTaskSchema>;

export const listCronTasksResponseSchema = z.object({
  tasks: z.array(cronTaskSchema),
});
export type ListCronTasksResponse = z.infer<typeof listCronTasksResponseSchema>;

export const createCronTaskRequestSchema = z.object({
  cron: z.string().min(1),
  prompt: z.string().min(1),
  recurring: z.boolean().optional(),
});
export type CreateCronTaskRequest = z.infer<typeof createCronTaskRequestSchema>;

export const createCronTaskResultSchema = z.object({
  task: cronTaskSchema,
});
export type CreateCronTaskResult = z.infer<typeof createCronTaskResultSchema>;

export const deleteCronTaskResultSchema = z.object({
  deleted: z.boolean(),
});
export type DeleteCronTaskResult = z.infer<typeof deleteCronTaskResultSchema>;

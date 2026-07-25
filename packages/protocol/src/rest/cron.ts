/**
 *   GET    /v1/sessions/{session_id}/cron
 *   POST   /v1/sessions/{session_id}/cron
 *   DELETE /v1/sessions/{session_id}/cron/{task_id}
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

import { z } from 'zod';

export const goalTypes = ['score', 'penalties', 'carry', 'tee_in_play', 'putts', 'custom'] as const;
export const goalLabels: Record<(typeof goalTypes)[number], string> = {
  score: 'Score target', penalties: 'Penalties per round', carry: 'Driver / club carry',
  tee_in_play: 'Tee shots in play %', putts: 'Putts per round', custom: 'Custom goal',
};
export const goalSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, 'Give your goal a title.').max(200),
  type: z.enum(goalTypes),
  target_value: z.number().finite(),
  starting_value: z.number().finite().nullable(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '0001-01-01';
  }, 'Choose a valid target date.').nullable(),
  status: z.enum(['active', 'completed', 'archived']),
  is_primary: z.boolean(),
  club: z.string().trim().max(80).nullable(),
  unit: z.string().trim().max(30).nullable(),
}).superRefine((goal, ctx) => {
  if (goal.is_primary && goal.status !== 'active') ctx.addIssue({ code: 'custom', message: 'Only active goals can be primary.' });
  if (goal.type === 'carry' && (!goal.club || !['m', 'yd'].includes(goal.unit ?? ''))) ctx.addIssue({ code: 'custom', message: 'Choose a club and distance unit.' });
  for (const field of ['target_value', 'starting_value'] as const) {
    const value = goal[field];
    if (value === null) continue;
    if (Math.abs(value) > 1_000_000 || (goal.type !== 'custom' && value < 0) || (goal.type === 'score' && value <= 0) || (goal.type === 'tee_in_play' && value > 100)) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'Check the target and starting values for this goal type.' });
    }
  }
});
export type GoalInput = z.infer<typeof goalSchema>;
export type Goal = GoalInput & { created_at: string; updated_at: string };
export function goalValue(goal: GoalInput, value = goal.target_value) {
  const unit = goal.type === 'tee_in_play' ? '%' : goal.type === 'score' ? 'strokes' : goal.type === 'penalties' ? 'penalties / round' : goal.type === 'putts' ? 'putts / round' : goal.unit;
  return `${value}${unit === '%' ? '' : ' '}${unit ?? ''}`.trim();
}

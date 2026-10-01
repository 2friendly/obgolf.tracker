import { createClient } from '@/lib/supabase/server';
import type { Goal } from '@/lib/goals';
import { buildGoalProgressIndex, calculateGoalProgress, type GoalProgressRecord } from '@/lib/goal-progress';

import { recommendGoalFocus } from '@/lib/goal-recommendations';
import { detectGoalInsights } from '@/lib/goal-insights';

// Paginate both sources: PostgREST's default row cap must not silently truncate a golfer's history.
export async function GET(request: Request) {
  const dashboard = new URL(request.url).searchParams.get('view') === 'dashboard';
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const goals: Goal[] = [];
    let lastGoalId: string | undefined;
    while (true) {
      let query = supabase.from('goals').select('id,title,type,target_value,starting_value,target_date,status,is_primary,club,unit,created_at,updated_at').eq('user_id', user.id).order('id').limit(500);
      if (lastGoalId) query = query.gt('id', lastGoalId);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      goals.push(...data as Goal[]); lastGoalId = data.at(-1)!.id;
    }
    const primary = goals.find(goal => goal.is_primary && goal.status === 'active');
    const result = (records: GoalProgressRecord[]) => {
      const index = buildGoalProgressIndex(records);
      const progress = Object.fromEntries(goals.map(goal => [goal.id, calculateGoalProgress(goal, index)]));
      let insights = null;
      if (dashboard && primary) {
        const detected = detectGoalInsights(primary, index);
        const findings = new Map(detected.findings.map(finding => [finding.id, finding]));
        for (const secondary of goals.filter(goal => goal.status === 'active' && goal.id !== primary.id)) {
          for (const finding of detectGoalInsights(secondary, index).findings) {
            if (!findings.has(finding.id)) findings.set(finding.id, finding);
          }
        }
        insights = { ...detected, recommendations: recommendGoalFocus(goals, index, { ...detected, findings: [...findings.values()] }) };
      }
      return Response.json(dashboard ? { progress, insights } : progress, { headers: { 'Cache-Control': 'private, no-store' } });
    };
    if (!goals.some(goal => goal.type !== 'custom') && !(dashboard && primary)) return result([]);
    const records: GoalProgressRecord[] = [];
    let lastRecordId: string | undefined;
    while (true) {
      // Do not transfer original import text or unrelated journal fields to the calculation layer.
      let query = supabase.from('records').select('id,kind,date:data->>date,category:data->>category,status:data->>status,holeCount:data->>holeCount,roundHoles:data->roundHoles,players:data->players,holes:data->>holes,score:data->score,club:data->>club,carry:data->carry,clubMetrics:data->clubMetrics')
        .eq('user_id', user.id).in('kind', ['round', 'session']).order('id').limit(500);
      if (lastRecordId) query = query.gt('id', lastRecordId);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      records.push(...data as unknown as GoalProgressRecord[]); lastRecordId = data.at(-1)!.id;
    }
    return result(records);
  } catch {
    return Response.json({ error: 'Could not calculate goal progress. Please retry.' }, { status: 503 });
  }
}

import { createClient } from '@/lib/supabase/server';
import { goalSchema } from '@/lib/goals';
import { z } from 'zod';

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}
export async function GET() {
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const { data, error } = await supabase.from('goals').select('id,title,type,target_value,starting_value,target_date,status,is_primary,club,unit,created_at,updated_at').eq('user_id', user.id).order('created_at', { ascending: false }).order('id');
    if (error) throw error;
    return Response.json(data ?? []);
  } catch {
    return Response.json({ error: 'Could not load goals. Please retry.' }, { status: 503 });
  }
}
async function save(request: Request, create: boolean) {
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const parsed = goalSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const { data, error } = await supabase.rpc('save_goal', { p_goal: parsed.data, p_create: create });
    if (error?.code === 'P0002') return Response.json({ error: 'Goal no longer exists.' }, { status: 404 });
    if (error?.code === '23505') return Response.json({ error: 'Goal changed. Reload and try again.' }, { status: 409 });
    if (error) throw error;
    return Response.json(data, { status: create ? 201 : 200 });
  } catch {
    return Response.json({ error: 'Could not save goal. Your input is still here.' }, { status: 503 });
  }
}
export const POST = (request: Request) => save(request, true);
export const PUT = (request: Request) => save(request, false);
export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
    const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get('id'));
    if (!id.success) return Response.json({ error: 'Invalid goal' }, { status: 400 });
    const { error } = await supabase.from('goals').delete().eq('user_id', user.id).eq('id', id.data);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Could not delete goal. Please retry.' }, { status: 503 });
  }
}

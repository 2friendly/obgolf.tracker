import { createClient } from '@/lib/supabase/server';
import { importRequestSchema, parseClubImport } from '@/lib/club-import';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: 'Sign in required' }, { status: 401 });
  // Bound the body before JSON parsing, including clients that omit Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: 'Missing file text' }, { status: 400 });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) { await reader.cancel(); return Response.json({ error: 'File text is too large' }, { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const input = importRequestSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!input.success) return Response.json({ error: 'Check the club, units and file size (150,000 text characters maximum).' }, { status: 400 });
    return Response.json(parseClubImport(input.data));
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Could not read this file' }, { status: 400 });
  }
}

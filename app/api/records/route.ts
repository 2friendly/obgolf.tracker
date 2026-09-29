import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const shotSchema = z.object({
  id: z.string().min(1).max(100),
  shotNumber: z.number().int().min(1).max(40),
  club: z.string().max(80),
  result: z.enum(["good", "left", "right", "short", "long", "top", "fat", "thin", "ob", "water", "other"]),
  distance: z.number().min(0).max(1000).optional(),
  penaltyStrokes: z.number().int().min(0).max(4),
  notes: z.string().max(500).optional(),
});
const playerHoleStatSchema = z.object({
  playerId: z.string().min(1).max(100),
  score: z.number().int().min(1).max(30).nullable(),
  putts: z.number().int().min(0).max(10).nullable(),
  teeResult: z.enum(["in_play", "left", "right", "ob", "water"]).nullable(),
  penalties: z.number().int().min(0).max(10),
  completed: z.boolean(),
  shots: z.array(shotSchema).max(40),
});
const holeSchema = z.object({
  hole: z.number().int().min(1).max(18),
  par: z.number().int().min(3).max(6),
  score: z.number().int().min(1).max(30).nullable(),
  distance: z.number().min(0).max(1000).optional(),
  playerStats: z.array(playerHoleStatSchema).max(8).optional(),
});
const playerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(50),
  scores: z.array(z.number().int().min(1).max(30).nullable()).max(18),
});
const clubMetricSchema = z.object({
  id: z.string().min(1).max(100),
  club: z.string().trim().min(1).max(80),
  sampleType: z.enum(["Average", "Best", "Single shot"]),
  clubSpeed: z.number().min(0).max(250).optional(),
  ballSpeed: z.number().min(0).max(300).optional(),
  smash: z.number().min(0).max(2).optional(),
  launch: z.number().min(-20).max(90).optional(),
  spin: z.number().min(0).max(20000).optional(),
  carry: z.number().min(0).max(600).optional(),
  total: z.number().min(0).max(600).optional(),
  notes: z.string().max(500).optional(),
});
const recordSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["session", "task", "expense", "milestone", "round"]),
  title: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  notes: z.string().max(5000).default(""),
  category: z.string().max(80).default(""),
  done: z.boolean().default(false),
  minutes: z.number().min(0).max(1440).optional(),
  cost: z.number().min(0).max(1000000).optional(),
  score: z.number().int().min(1).max(300).optional(),
  holes: z.enum(["9", "18"]).optional(),
  carry: z.number().min(0).max(600).optional(),
  speed: z.number().min(0).max(250).optional(),
  club: z.string().max(80).optional(),
  clubMetrics: z.array(clubMetricSchema).max(50).optional(),
  holeCount: z.enum(["9", "18"]).optional(),
  roundHoles: z.array(holeSchema).max(18).optional(),
  players: z.array(playerSchema).min(1).max(8).optional(),
  teeName: z.string().max(80).optional(),
  status: z.enum(["setup", "active", "complete"]).optional(),
  activeHole: z.number().int().min(1).max(18).optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  clientUpdatedAt: z.string().datetime().optional(),
}).superRefine((record, context) => {
  if (record.kind === "round" && (!record.holeCount || !record.roundHoles || record.roundHoles.length !== Number(record.holeCount))) {
    context.addIssue({ code: "custom", message: "Round scorecard does not match its hole count", path: ["roundHoles"] });
  }
  if (record.kind === "round" && record.players?.some((player) => player.scores.length !== Number(record.holeCount))) {
    context.addIssue({ code: "custom", message: "Player scorecard does not match the round length", path: ["players"] });
  }
  if (record.kind === "round" && record.roundHoles?.some((hole) => hole.playerStats?.some((stat) => !record.players?.some((player) => player.id === stat.playerId)))) {
    context.addIssue({ code: "custom", message: "Hole data references an unknown player", path: ["roundHoles"] });
  }
});

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}

export async function GET() {
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    const { data, error } = await supabase
      .from("records")
      .select("data")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return Response.json((data ?? []).map((row) => row.data));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not load your records. Please retry." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const parsed = recordSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Please check the fields and try again." }, { status: 400 });
    const { supabase, user } = await authenticatedClient();
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    const record = parsed.data;
    const { error } = await supabase.from("records").upsert({
      id: record.id,
      user_id: user.id,
      kind: record.kind,
      data: record,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,id" });
    if (error) throw error;
    return Response.json(record);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not save. Your input is still here." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Missing record" }, { status: 400 });
    const { supabase, user } = await authenticatedClient();
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    const { error } = await supabase.from("records").delete().eq("user_id", user.id).eq("id", id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not delete. Please retry." }, { status: 503 });
  }
}

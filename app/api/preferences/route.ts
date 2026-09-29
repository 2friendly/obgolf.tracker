import { createClient } from "@/lib/supabase/server";
import { currencies, defaultPreferences } from "@/lib/preferences";
import { z } from "zod";

const preferencesSchema = z.object({
  currency: z.enum(currencies),
  distanceUnit: z.enum(["m", "yd"]),
  speedUnit: z.enum(["mph", "kmh"]),
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
      .from("user_preferences")
      .select("currency,distance_unit,speed_unit")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return Response.json(data ? {
      currency: data.currency,
      distanceUnit: data.distance_unit,
      speedUnit: data.speed_unit,
    } : defaultPreferences);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not load preferences." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const parsed = preferencesSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Please choose valid units." }, { status: 400 });
    const { supabase, user } = await authenticatedClient();
    if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
    const preferences = parsed.data;
    const { error } = await supabase.from("user_preferences").upsert({
      user_id: user.id,
      currency: preferences.currency,
      distance_unit: preferences.distanceUnit,
      speed_unit: preferences.speedUnit,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return Response.json(preferences);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not save preferences." }, { status: 503 });
  }
}

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: "Sign in required" }, { status: 401 });

    const [coursesResult, teesResult, holesResult] = await Promise.all([
      supabase.from("golf_courses").select("id,name,source_url").eq("active", true).order("name"),
      supabase.from("course_tees").select("id,course_id,name,holes_count,total_par").order("name"),
      supabase.from("course_holes").select("tee_id,hole_number,par,distance_metres").order("hole_number"),
    ]);
    const error = coursesResult.error ?? teesResult.error ?? holesResult.error;
    if (error) throw error;

    const courses = coursesResult.data ?? [];
    const tees = teesResult.data ?? [];
    const holes = holesResult.data ?? [];
    const catalog = tees.flatMap((tee) => {
      const course = courses.find((candidate) => candidate.id === tee.course_id);
      if (!course) return [];
      const teeHoles = holes
        .filter((hole) => hole.tee_id === tee.id)
        .sort((a, b) => a.hole_number - b.hole_number);
      if (teeHoles.length !== tee.holes_count) return [];
      return [{
        id: tee.id,
        name: course.name,
        teeName: tee.name,
        pars: teeHoles.map((hole) => hole.par),
        distancesMetres: teeHoles.every((hole) => hole.distance_metres === null)
          ? undefined
          : teeHoles.map((hole) => hole.distance_metres === null ? undefined : Number(hole.distance_metres)),
        sourceUrl: course.source_url ?? undefined,
      }];
    });

    return Response.json(catalog, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Could not load courses." }, { status: 503 });
  }
}

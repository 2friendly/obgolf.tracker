import { redirect } from "next/navigation";
import Dashboard from "./dashboard-client";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="auth-shell">
        <section className="auth-card setup-card">
          <span className="auth-kicker">SETUP REQUIRED</span>
          <h1>Connect Supabase.</h1>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code>, add your
            Supabase project URL and publishable key, then run the included SQL
            migration.
          </p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <Dashboard userEmail={user.email ?? "Golfer"} />;
}

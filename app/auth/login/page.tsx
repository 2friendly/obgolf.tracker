import { redirect } from "next/navigation";
import { Flag, Mail } from "lucide-react";
import { requestMagicLink } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-mark"><Flag size={25} /></div>
        <span className="auth-kicker">YOUR GAME · ONE JOURNAL</span>
        <h1>Step into the training room.</h1>
        <p>Your rounds, practice numbers, goals and spending stay attached to your account.</p>
        <form action={requestMagicLink} className="auth-form">
          <label htmlFor="email">Email address</label>
          <div className="auth-input"><Mail size={18} /><input id="email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" required autoFocus /></div>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="button primary" type="submit">Email me a sign-in link</button>
        </form>
        <small>No password to remember. The secure link signs you in on this device.</small>
      </section>
    </main>
  );
}

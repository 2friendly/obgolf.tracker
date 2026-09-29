import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-mark"><MailCheck size={25} /></div>
        <span className="auth-kicker">LINK SENT</span>
        <h1>Check your inbox.</h1>
        <p>Open the sign-in link sent to <strong>{email ?? "your email address"}</strong>. You can close this screen afterward.</p>
        <Link className="button" href="/auth/login"><ArrowLeft size={17} />Use another email</Link>
      </section>
    </main>
  );
}

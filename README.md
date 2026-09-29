# Golf Progress

A mobile-first personal golf tracker for rounds, practice sessions, club data, goals, tasks, and spending.

## Stack

- Next.js 16 and React 19
- Supabase Postgres and passwordless authentication
- Supabase Row Level Security for per-account data isolation
- Vercel hosting

## Local setup

1. Create a Supabase project.
2. Run `supabase/migrations/20260929000000_create_records.sql` in the Supabase SQL Editor.
3. Copy `.env.example` to `.env.local`.
4. Add the project URL and publishable key from Supabase's Connect panel.
5. Add `http://localhost:3000/auth/callback` to the Supabase Auth redirect URLs.
6. Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

The app shows a setup screen instead of crashing when Supabase environment variables are absent.

## Vercel deployment

Import the repository into Vercel and add these environment variables for Production, Preview, and Development:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Add the deployed `https://your-domain/auth/callback` URL in Supabase Authentication → URL Configuration. Set the Supabase Site URL to the production domain.

## Data security

Every record includes the authenticated user's ID. The migration enables Row Level Security and defines separate read, insert, update, and delete policies. The API validates the user session before every operation; the database policies provide a second enforcement layer.

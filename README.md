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

## Importing club data

Open a session (or Analytics → Log club data), then choose **Import photo or file** under Club measurements. Select the club, sample type and the units used in your export. Upload PNG/JPG/WebP, TXT, CSV or JSON, review the readings, add them, then save the session.

CSV headers support club, carry, total distance, club/head speed, ball speed, smash factor, launch angle and spin/backspin. For example:

```csv
Club,Carry (yd),Club Speed (mph),Ball Speed (mph),Smash Factor,Launch Angle,Spin Rate
Driver,240,100,145,1.45,12,2500
7-iron,160,85,112,1.32,18,6500
```

JSON accepts an array of objects or a `shots`, `readings` or `clubMetrics` array. TXT and image extraction support named tables and labelled measurements such as `Carry: 180 m`. Individual readings are retained; averages and best shots can be explicitly classified. Units in headers/values take priority over the selected file units. Storage uses metres and mph.

Photo OCR uses Tesseract.js in a browser worker, loaded only when a photo is selected. No OCR service account or API key is required. The initial engine/language download needs internet access. Photos stay on the device; extracted source text and any corrections are saved with the session. Original image files are not stored. Use a clear, cropped image with English labels; unfamiliar layouts may require corrections in the extracted-text editor. Review is mandatory, and unreadable/out-of-range values are flagged rather than guessed.

Limits: 500 readings and 10 source files per session; text files up to 150 KB, images up to 10 MB / 20 megapixels. The existing authenticated records API validates and stores imports in its JSONB data, with no SQL migration or changes to historical records.

# Golf Progress

A mobile-first personal golf tracker for rounds, practice sessions, club data, goals, tasks, and spending.

## Stack

- Next.js 16 and React 19
- Supabase Postgres and passwordless authentication
- Supabase Row Level Security for per-account data isolation
- Vercel hosting

## Local setup

1. Create a Supabase project.
2. Run the SQL files in `supabase/migrations/` in timestamp order in the Supabase SQL Editor (or use the Supabase CLI migration workflow).
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

The dense simulator layout with Ball Speed, Total Carry, Total Distance, Back Spin, Side Spin, Offline, HLA, VLA, Peak Height and Dist to Pin has a table adaptor. It finds row/column positions, enlarges each cell and enhances contrast locally before OCR. The dark average footer is excluded from individual-shot capture. Low-confidence cells remain empty with their original candidates preserved for review. Readings can be corrected directly in the review cards; the uploaded image is available for comparison. Confirm the file units: this layout does not label its speed units. A direct screenshot or native CSV is still preferable to a photo of a monitor. This image adaptor supports up to 50 visible rows per photo.

Imports also retain signed back/side spin, offline distance, horizontal launch, peak height and distance to pin in the existing session JSONB model. VLA maps to vertical launch; HLA remains a separate observation. Existing analytics continue using their established metrics; charts for the additional fields are deferred. Test fixtures use synthetic observations rather than user golf data.

Limits: 500 readings and 10 source files per session; text files up to 150 KB, images up to 10 MB / 20 megapixels. The existing authenticated records API validates and stores imports in its JSONB data, with no SQL migration or changes to historical records.

## User goals

Open **Goals** in desktop navigation or **More → Goals** on mobile. Create measurable goals for score, penalties per round, club carry, tee shots in play, putts per round, or a custom metric. Each goal stores a target, optional starting value and target date, and active/completed/archived status. Carry goals include a club and explicit metres/yards unit; custom goals may include a unit label. Score targets mean scoring below the target in a complete 18-hole on-course round.

You can designate one active primary goal and keep multiple secondary goals. Changing the primary is transactional. Completing or archiving a primary clears its designation; reactivating it makes it secondary. Completion is recorded manually in this foundation. Existing milestones remain available separately and are not converted or deleted.

Before deploying this feature, apply `supabase/migrations/20261001000000_create_goals.sql`. The additive migration creates a separate goals table, user-scoped read/delete policies, and an authenticated save function that enforces ownership and primary uniqueness. Existing record tables are unchanged. Run `pnpm test`, `pnpm lint`, and `pnpm build` for application checks. With local Supabase running, use `supabase test db` for goal ownership, lifecycle, constraint, and transaction rollback tests in `supabase/tests/goals.sql`.

## Deterministic goal progress

Goal cards and the primary-goal dashboard derive progress from existing records through authenticated `GET /api/goals/progress`. The endpoint enforces user ownership, paginates history, omits original import text, and normalizes observations once for all goals. The UI retains the summary and refreshes it after relevant saved records or goals change. Calculated current values, baselines, percentages, and trends are not written to the database; this addition needs no new migration.

- **Score:** best completed 18-hole on-course score across recorded history. Legacy course-session totals are supported; simulator and unfinished rounds are excluded. Break 90 requires 89 or better, so percentage progress uses 89 as the endpoint.
- **Penalties:** average hole-total penalties in the latest five eligible completed 18-hole rounds. Every hole must have recorded penalty data. Shot attribution is not added again, and historical score-only rounds do not imply zero penalties.
- **Putts:** average round total in the latest five completed 18-hole rounds with putts recorded on every hole. Missing putts do not mean zero and are not extrapolated.
- **Tee shots in play:** in-play / tracked tee results on par 4/5/6 holes in the latest five eligible completed rounds (9 or 18 holes). Missing outcomes are excluded from the denominator; rounds are weighted by their tracked tee shots.
- **Carry:** average of session means in the latest five practice sessions for the selected club, with equal weight per session. Individual shots take priority over averages for that club within a session. Best entries and duplicate session-level mirrors are excluded. Legacy carries are supported. Stored metres are converted to the goal's explicit distance unit. Shot counts and recorded averages are reported separately because summary entries have no known underlying shot count.

The entered starting value overrides the derived baseline; otherwise the first eligible round or session supplies it. All recorded history, including observations before goal creation, is eligible. Percentage progress measures baseline-to-target change and is clamped to 0–100. No percentage is invented when data is absent or the baseline is already on the target side and current performance misses the target. Recorded target attainment is an observation; goal completion remains manual.

Recent trends compare the last three eligible rounds/sessions with the preceding three using the same weighting as the metric (scoring trend uses average scores rather than best score). At least six observations and a date boundary between the windows are required; otherwise the trend is unavailable. Fewer than three eligible rounds/sessions are labelled limited data. Custom goals retain their entered targets and baselines but have no automatic metric mapping. Completed/archived goals continue to show live derived data rather than storing a historical snapshot.

`lib/goal-progress.test.ts` covers completion and player filtering, legacy records, missing and zero metrics, strict score targets, penalty attribution, percentage denominators, carry sample types and units, rolling windows, trends, baselines, and immutability.

## Goal-focused dashboard and repeated performance patterns

The primary dashboard shows the selected goal, its entered/derived baseline, current value, target progress and recent average trend. Up to three findings appear alongside it, with measurements and samples visible and the detailed evidence/rule expandable. Other findings and data coverage are available under **More evidence and data coverage**. Existing score history, practice rhythm, tasks, latest session, starter plan and spending remain available under **Round history, practice and your journal** and their existing navigation sections.

`GET /api/goals/progress?view=dashboard` returns `{ progress, insights }` from one shared normalized index of the authenticated user's records. The default endpoint keeps its previous progress-map response. Derived findings are not persisted; no new migration is required. Existing record and goal save/delete invalidation refreshes the dashboard. A missing primary goal prompts goal selection; a custom goal remains unmapped and shows course observations as context.

Rules in `lib/goal-insights.ts` are transparent product heuristics rather than golfer-specific coaching benchmarks. Every signal needs recurrence across at least three distinct round/session dates, not just a large aggregate produced by one outlier. Round patterns use the latest five completed scorecards; each rule independently checks tracking coverage. Score-only legacy data does not imply zero putts or penalties. Only the first player's results are used.

| Area | Additional rule and evidence requirements |
| --- | --- |
| Penalties | Complete 18-hole penalty data; average ≥2 per round and ≥2 in three rounds. Hole totals are authoritative; shot attribution is not added again. |
| Tee shots in play | ≥30 recorded par 4/5/6 tee outcomes, at least six per round; overall and three round rates ≤60%. Completed 9- and 18-hole rounds are eligible. |
| Directional tee misses | Same tee sample; recorded left/right ≥30% overall and in three rounds. OB/water sides are not inferred. |
| Putts | Full 18-hole putting records; average ≥36 per round and ≥36 in three rounds. No explanation about putting technique or approach quality is inferred. |
| Three-putts | ≥54 tracked putting holes, at least nine per round; 3+ putts on ≥10% overall and in three rounds. |
| Large hole scores | ≥2 holes at least three over par per 18-hole round on average and in three rounds. |
| Scoring by par | ≥12 holes of the relevant par type; average ≥1.5 over par and ≥0.5 worse than other par types, recurring in three rounds. Comparisons use excess over par, not raw scores; course difficulty is not adjusted. |
| Carry consistency | ≥30 individual carry observations, at least ten per session; population SD / mean ≥15% within three sessions. Averages and Best entries cannot support dispersion. |
| Practice offline pattern | ≥30 individual offline measurements, at least ten per session; ≥60% finish at least ten metres to one recorded side overall and in three sessions. No transfer to on-course misses or swing cause is assumed. |
| Selected-club carry decline | Six eligible session means, three distinct dates per window; latest three average ≥5% lower, and each recent session ≥5% below the preceding mean. Individual shot and recorded-average counts remain explicit. |

Findings affecting the primary goal metric are listed first, followed by course context; practice context stays separate. A carry goal's primary findings use its selected club. Findings can overlap and are not summed into an estimate of recoverable strokes. Thresholds and dates are shown with each finding. Failure to meet a sample threshold is distinct from having enough data with no rule triggered. Speed, launch and spin remain available in Club Analytics without inventing universal weakness thresholds for those metrics.

`lib/goal-insights.test.ts` tests recurrence, outlier rejection, recent windows, missing coverage, primary-player isolation, relative-to-par scoring, practice sample types, carry decline and determinism.

### Deterministic next focus and practice/course connections

The authenticated dashboard progress endpoint also returns a structured `recommendations` summary. It contains one `primary` focus, ranked `candidates`, and practice/course `connections`. These are derived on the server from the same normalized history as goal progress; no recommendation values are stored and no LLM is involved.

Priority combines normalized goal relevance (40%), problem magnitude/frequency (25%), sample coverage (15%), recent trend (10%), and practice/course agreement (10%). Secondary goals receive 70% relevance when a primary goal exists. Custom goal text is not interpreted as a measurable objective. Related areas are merged per club; all underlying observations remain available in expanded dashboard evidence. Confidence describes repeated evidence coverage, not statistical or causal certainty. The thresholds and weights are product heuristics.

Club-specific course accuracy uses only explicitly recorded, unambiguous first shots on par 4/5/6 holes from the account player's completed rounds. Recorded tee outcomes take precedence over shot result classifications. Missing clubs, second shots, companions, and unknown OB/water directions are never inferred. A course pattern requires 30 observed first tees across at least 3 distinct dates, at least 6 per round, and repeated ≤60% in play or ≥20% OB/water. Practice accuracy uses RMS offline from target (includes both spread and bias), requiring 30 individual measurements, at least 10 per session and 3 distinct dates with RMS ≥15 m. Best/Average entries are excluded. Agreement can raise confidence when both patterns recur and their latest records are within 90 days; otherwise findings retain moderate confidence. Recent five-record windows are used, and larger samples increase coverage priority.

Practice/course trends require two ordered three-record windows, each with 30 observations and 3 distinct dates. Every recent record must support the change, avoiding single-event trends. Possible transfer requires ≥20% improved offline RMS followed by ≥10 percentage-point improved in-play rate or ≥0.5 fewer attributed first-tee penalty strokes per completed 18-hole round. The prior course window must precede the improved practice window, which must finish before the subsequent course window. First-tee penalty attribution is a subset, never added to hole totals. Speed increases ≥5% alongside accuracy declines ≥10 points are shown as mixed trends without implying causality. Same-day ordering is not inferred; practice intent, course difficulty and conditions are not controlled. Insufficient evidence produces no primary focus rather than generic coaching advice.

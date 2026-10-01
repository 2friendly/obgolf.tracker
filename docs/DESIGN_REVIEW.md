# Golf Progress design review

Reviewed 1 October 2026 using the frontend-design skill, `.impeccable.md`, and `docs/PRODUCT.md`.

The app has a coherent foundation: a focused golf performance identity, strong primary contrast, goal-based progress, deterministic evidence, optional shot capture, and automatic round persistence. Preserve these. The biggest opportunity is to make the improvement story faster to read and act on.

**Review scope:** Current source plus local Chromium renders of Overview, Club Analytics, and an active round at 1440, 390, and 320 pixels wide, with an 844-pixel viewport height. All golf records and API responses used for visual checks were synthetic. Import, goal editing, authentication, persistence, and security observations below come from source inspection; this was not a production, network-failure, or security penetration test. No application changes were made.

**Priority:** P1 = address next because it affects trustworthy data or core mobile use. P2 = improve comprehension and workflow. P3 = refinement after those changes.

| Priority | Area | Finding | Recommended improvement |
| --- | --- | --- | --- |
| P1 | Round persistence | In `flushSave`, an earlier failed request assigns its snapshot back to `pendingSave`, potentially replacing a newer edit queued while that request was in flight. | Preserve the newest revision, retry when connectivity returns, and test rapid edits during a failed save. |
| P1 | Mobile touch targets | At 390px, the four penalty buttons measure approximately **33.4 × 46px**. Height alone does not meet the project's 44 × 44px rule. | Use a two-by-two layout or a full-width penalty row; test each interactive target in both dimensions. |
| P1 | Round action placement | At 320 × 844px, “Finish hole” starts at y≈826 and extends beyond the viewport. | Keep the primary completion action in a sticky bottom area with safe-area padding and sufficient scroll clearance. |
| P1 | Historical currency | Currency preferences change the labels on previously recorded costs without conversion or preservation of each record's original currency. The interface warns about this, but historical values can still become misleading. | Store transaction currency per cost. Preserve old records through a migration; never infer an original currency when it is unknown. |
| P2 | Home hierarchy | At 390px, the introduction and primary-goal panel consume the first viewport; the next-focus panel starts around y≈893. | Shorten the introduction, compact baseline/current/target, and put one focus plus its action earlier. |
| P2 | Navigation | Eight desktop destinations compete for attention; Goals is under More on mobile. | Consider Home, Rounds, Practice, Goals, More. Keep detailed Analytics under Home/More and link to relevant analytics from the goal. |
| P2 | Actions | The global “Log a session” persists on every section; Analytics adds “Log club data,” and Sessions adds another logging action. An active round is available only inside Rounds. | Show “Resume round” prominently on Home when applicable. Use one context-appropriate primary action per screen, with the alternative capture action secondary. |
| P2 | Goal interpretation | “Where I am now” can show a best score while “Am I improving?” uses recent averages. Both are useful but easy to read as the same measure. | Label them explicitly as “Best score” and “Recent scoring average.” Show the target gap in strokes as well as the baseline-to-target percentage. |
| P2 | Insight readability | Main evidence repeats amounts, sample counts, dates, and limitations in a long paragraph. Expanded evidence exposes rule IDs and ranking weights. | Lead with one plain observation and its sample; retain limitations and calculation explanations behind disclosure. Keep internal rule IDs out of the golfer-facing view. |
| P2 | Practice action | A recommended focus has evidence but no direct action to turn it into a task or a practice session. | Add “Add to practice plan” or “Log practice for this focus,” using existing tasks and session capture. Prefill a measurable focus without inventing a swing diagnosis. |
| P2 | Charts | SVG charts shrink desktop text with their viewBox. Trend x positions use observation index rather than elapsed time. Native SVG title tooltips are difficult to use on phones. | Use a mobile chart layout, legible labels, tap selection, and either real date spacing or a clearly labelled session axis. |
| P2 | Sample comparability | Club Analytics defaults to All types and combines single shots, recorded averages, Best entries, and legacy readings into one average. | Default comparisons to compatible observations. Keep Best entries separate and distinguish session means from shot-weighted means. |
| P2 | Accessibility | Tee, penalty, shot-result, club, and metric selections frequently depend on CSS classes without exposing their selected state. | Use appropriate radio groups or `aria-pressed`; provide visible text/icon state cues and consistent keyboard focus. |
| P3 | Visual system | Styles contain the earlier light design followed by extensive dark overrides, hardcoded colors, and repeated breakpoints. Arial and widespread small monospace labels weaken the intended performance identity. | Consolidate semantic tokens and component ownership incrementally, then refine typography and spacing. |

**Color: keep the identity, give colors clearer jobs.**

The deep green and lime pairing suits the saved brand direction. A wholesale palette change would be unnecessary. Currently lime represents branding, primary actions, selected states, chart series, and positive changes. This makes unrelated states look equally important. Use lime for the main action and key emphasis, softer turf green for improvement, restrained amber for limited evidence, and warm coral for failed saves or errors. Ordinary selections can use a tinted surface, stronger outline, and checkmark.

Suggested starting tokens, retaining the current foundations:

| Role | Color | Use |
| --- | --- | --- |
| Canvas | `#101712` | Main background |
| Surface | `#1A251D` | Grouped content |
| Raised surface | `#24332A` | Menus and selected controls |
| Primary text | `#F2F5EB` | Headings and key values |
| Secondary text | `#B8C6B8` | Explanations and labels |
| Main accent | `#C8F763` | Primary action and limited emphasis |
| Improvement | `#9FD6B0` | Favorable change, with directional labels |
| Limited evidence | `#F0C374` | Caution, with explanatory text |
| Error | `#F1A18B` | Failed save and validation |

These are candidate roles, not a fully validated replacement palette. Check every foreground/background pair and state before implementation. Never make color the only signal. A larger metric value is not always an improvement: launch, spin, or smash changes need context rather than automatic green coloring.

Calculated contrast from current CSS: lime on canvas ≈14.7:1; primary-button text on lime ≈13.5:1; standard muted text on a panel ≈7.1:1. The `#718170` Optional label on `#18241C` is ≈3.9:1, below the usual 4.5:1 benchmark for small text. Some labels are only 9–11px, so size also needs attention. Subtle panel separators can stay quiet, while control boundaries and focus indicators should be clearly distinguishable. Test daylight readability on an actual phone before deciding whether an optional outdoor/light theme is necessary.

**Typography and layout.**

Use one legible, slightly distinctive sans family throughout, such as a locally hosted Source Sans 3 or a similarly readable humanist face. Apply tabular numerals to scores and measurements. An additional display font is optional; readability outdoors is more valuable than decorative type. Reduce uppercase monospace to occasional metadata. Aim for 15–16px reading text and 12–13px supporting labels, with the score remaining dominant.

On Home, shorten “PERSONAL PERFORMANCE CENTRE” and the repeated introductory sentence. “Improving · −8.3 strokes” is easier to scan than making “Recent average improving” a large headline; explain the comparison window below it. Flatten nested evidence containers and reserve large panels for the goal and focus. Use tighter spacing within a measurement group and larger gaps between different decisions. Desktop can use more width to show progress and focus together, while mobile should show a compact sequence rather than shrinking that composition.

**On-course flow and feedback.**

Preserve the single-hole score stepper and optional shot detail. Add direct putt choices such as 0, 1, 2, 3+ if user testing confirms that they reduce taps. Keep “no putting data recorded” distinct from zero putts. Make penalty terminology clear about whether score already includes penalties, and allow totals above three: stored hole penalties support up to ten, while quick capture only exposes 0–3. Provide an accessible expanded control for larger totals.

Completed-hole circles replace hole numbers with checkmarks; retain the number so revisiting a hole remains easy, and provide accessible labels such as “Hole 4, complete.” Keep course identity visible in compact form on mobile. Consider a route for active play later if it improves browser-back and resume behavior; the current full-screen dialog can be improved incrementally.

Show “Saved on this device,” “Syncing,” and “Synced” only when those states can be established. Local cache write failures are currently swallowed, so do not promise offline safety unconditionally. Add recovery feedback and preserve the newest unsynced revision. Scope local round cache to account and round, and review sign-out cleanup. Sessions and practice drafts should survive accidental closure or offer a discard prompt when dirty.

**Goals, onboarding, and language.**

Keep goal selection personal. The starter plan still adds Break 90/100 milestones and a fixed practice routine; the app title still says “Road to 90.” Offer selectable starter templates based on the chosen goal instead of adding all of them. Let the weekly practice aim follow the user's activity goal or preference.

Separate active goals from achieved milestones in the UI so they do not appear to be two competing goal systems. With no data, explain the smallest useful capture action. With limited data, describe what is missing for that particular metric and give a direct action. Avoid a generic instruction to collect more data when a specific missing field can be named.

Add short explanations for carry, smash factor, launch, and dispersion. Replace implementation language such as “stored internally in metres” with guidance that helps the golfer enter the right value. Keep the useful distinction between observations and possible explanations.

**Practice capture and imports.**

Structured file import should have prominent access from Practice; currently it is embedded inside session editing. Preserve the existing import review, unit choices, source provenance, and flagged-value correction. Simplify the entry path to choose file/photo → confirm source and units → review → add shots. Show shots accepted, excluded, flagged, and detected duplicates before committing. Existing exact-source-text duplicate checks should not be described as complete overlap detection.

Start with essential fields and reveal advanced metrics. A spreadsheet can remain useful for bulk desktop entry, but phone users need a readable quick-entry option alongside it. Dirty form recovery and a reachable save action matter more than extra animation. Native HEIC handling would reduce friction for iPhone photos; until implemented, explain the supported formats before upload.

**Analytics accuracy and trust.**

Retain the evidence thresholds and deterministic calculations. Club Analytics needs equivalent care: avoid calling first-to-last shot difference a general performance trend, keep sample types compatible, and show date windows and meaningful sample counts. Do not present regression slope as a causal carry gain. Guard the regression against constant club speed, where its denominator is zero; show an unavailable state instead of NaN. A sample of two can produce a line but does not establish a reliable relationship.

Offer dispersion and directional bias where individual offline measurements support them. Keep missing data visibly different from zero, and show why a chart is unavailable. Avoid oversized claims about practice-to-course transfer when only practice evidence exists.

**Performance, accessibility, and technical maintenance.**

`GET /api/records` currently returns full history, including detailed shot/source data. This is reasonable for a small personal dataset, but plan paginated histories and summary responses so Home does not need every imported shot. Keep expensive analytics server-side, and retain deferred OCR loading. Introduce these incrementally when data volume justifies it.

Use concise screen-reader chart summaries plus an accessible data table instead of enumerating every shot in one SVG label. Verify keyboard operation, 200% zoom, visible focus, and reduced-motion behavior. Keep transitions limited to state feedback; no decorative animation is needed for active scoring.

Server-side authentication, user-scoped record queries, and import validation already exist. Preserve them while refactoring. Separately test cross-account authorization and local-cache behavior; source inspection alone does not certify security.

**Suggested implementation sequence.**

1. Protect the newest round edit during save failures; clarify sync recovery and historical currency.
2. Fix narrow penalty targets and keep Finish hole reachable on small phones.
3. Compact Home, surface Resume round, and connect next focus to practice capture.
4. Fix sample comparability, mobile charts, regression edge cases, and selected-state accessibility.
5. Consolidate tokens and CSS, then refine typography, color semantics, and spacing.

Most visual changes need no schema migration. Account-scoped draft recovery and navigation need state/API consideration. Transaction currencies require a backward-compatible schema change. History pagination changes API contracts. Preserve existing records, goals, imports, tasks, spending, and milestones through every step.

**Mobile-first revision following user feedback.**

The user confirmed that mobile is the primary platform and that the interface feels clumped and cumbersome. Treat mobile structure as the main design problem, ahead of desktop composition or aesthetic polish. The first improvement should be a coherent phone layout, not simply smaller panels or less padding.

The current shared page introduction and global Log a session button remain above section-specific headings and actions. This repeats hierarchy, consumes the first screen, and makes each section feel like another dashboard stacked underneath the previous one. Remove that shared introduction from secondary screens. Give every screen one compact title, one principal task, and clearly separated secondary information.

Proposed phone structure:

| Screen | First screen | Secondary content |
| --- | --- | --- |
| Home | Compact goal summary; Resume round when active; one current focus with an action | Recent improvement, latest activity, deeper evidence |
| Play | Active round or Start round, with recent course available | Completed round history and post-round review |
| Practice | Import session or quick log, with a clear primary action based on context | Recent practice sessions; club details within each session |
| Goals | Primary goal and compact progress; other goals below | Goal editing, completed goals, measurement explanations |
| More | Tasks, detailed analytics, milestones, spending, preferences | Account actions |

Use Home, Play, Practice, Goals, More as the proposed five-item bottom navigation. Keep full history and advanced analytics accessible. Play can reuse the existing Rounds implementation; Practice can reuse Sessions and import components. Navigation labels and information hierarchy can change without replacing the data model.

Home should read in this order:

1. Small page title and account control.
2. Active-round resume strip, when applicable.
3. Compact personal goal: target, explicitly named current metric, and gap to target. Keep its editing link reachable.
4. One next focus: plain observation, short sample label, and Add to practice plan or Log practice action. Show a capture prompt when evidence is insufficient.
5. Recent activity and a link to the relevant progress view.

Avoid a separate card for every value. Use a single goal section with aligned values, one distinct focus section, and plain activity rows divided by space or rules. Show only one layer of explanatory copy by default; put methodology and complete evidence behind specific links. Establish stronger section spacing while keeping related label/value pairs close together.

During play, prioritize current hole, score adjustment, and a reachable Finish hole action. Place putts and penalties in clear, adequately sized groups; make tee result a separate optional group and detailed shots expandable. A compact sticky action area should not cover any input or error message. On shorter screens, advanced details may scroll while scoring and completion remain easy to reach.

Validate the revised layout at 320px and 390px wide and at both tall and short viewport heights. Test actual tap counts for a typical hole and a basic practice log. Verify that the user can identify their goal, next action, and save state without hunting through several stacked panels. Preserve readability and touch sizes when reducing density; removing redundant hierarchy is more useful than squeezing content tighter.

**Implemented mobile pass — 1 October 2026.**

Implemented Home / Play / Practice / Goals / More navigation, section-specific headings, a compact goal summary with expandable baseline/trend details, a direct Home resume-round shortcut, a practice-plan action from the recommended focus, direct practice import access, a mobile session-filter dropdown, simpler activity rows, and phone-sized chart viewBoxes. The green/lime identity remains, with softer green for favorable trends and clearer selected-control states.

Active rounds now have an independent scrolling capture area and a permanent completion action, adequately sized penalty buttons, visible mobile course identity, numbered completed-hole navigation, selected-state accessibility, and explicit save retry. Failed saves preserve a newer pending snapshot. Existing records, imports, goals, milestones, spending, and analytics remain accessible; no schema/API changes were made.

Browser verification used synthetic records at 320 × 568, 390 × 844, 768 × 1024, and 1440 × 900. It covered navigation, direct round setup/resume, task creation from a focus, practice save/edit, import entry, goal entry, empty states, minimum penalty target sizes, completion-action placement, horizontal overflow, and recovery from a failed request while a newer score was queued. The 390px Home focus action fits above bottom navigation. Existing automated tests: 93 passing. Lint passed.

The broader review's transaction-currency migration, sample-comparability calculations, regression edge cases, account-scoped offline cache, and historical-data pagination remain separate follow-up work.

**Mobile follow-up — 2 October 2026.**

Practice capture now starts with title, category, and date. Duration, cost, score, and detailed club input sit behind expandable sections. Existing measurements and session details reopen when editing a record that already contains them, and the direct import action opens club data automatically. Unsaved record edits and uploaded import previews trigger a discard confirmation when closing; choosing Keep editing retains them. A browser-unload guard covers the same dirty draft. Save confirmations are visible above mobile navigation.

Goal cards now show one completion/reactivation action and an options menu for primary status, archiving, and deletion. Larger hole penalty totals (0–10) are accessible through an expanded control, respecting shot-attributed minimums. Failed round saves remain visible and retryable after exiting active play or opening post-round review.

Synthetic browser checks passed at 390 × 844, 320 × 568, and 1440 × 900, covering clean/dirty closure, uploaded preview retention, quick save, exact preservation of existing shot observations, goal menus and status changes, larger penalties, hole completion/revisit, and retry after leaving a round. No schema/API changes were required.

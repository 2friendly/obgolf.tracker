# AGENTS.md

## Project

This repository contains **Golf Progress**, a mobile-first golf improvement tracking application.

Before making product, UX, data-model, analytics, or architectural changes, read:

- `docs/PRODUCT.md`

Treat `docs/PRODUCT.md` as the source of truth for product direction.

If an implementation request appears inconsistent with the product specification, identify the
conflict before making a large architectural change.

---

## Core Product Principle

Golf Progress is not primarily a scorecard application.

The core product loop is:

**Goal → Play / Practice → Capture → Analyse → Identify → Practice → Measure**

The application should help golfers understand whether they are improving and what they should work on
next.

---

## Before Changing Code

Before implementing a substantial feature:

1. Inspect the existing implementation.
2. Understand the current data model.
3. Identify reusable components and patterns.
4. Check for existing functionality before creating duplicates.
5. Consider migration/backward-compatibility requirements.
6. Preserve existing user data.
7. Prefer incremental changes over unnecessary rewrites.

Do not replace working architecture simply because another implementation would be cleaner in
isolation.

---

## Development Priorities

When trade-offs are required, prioritize:

1. Data integrity
2. Fast mobile UX
3. Correct analytics
4. Maintainability
5. Extensibility
6. Visual polish

The deployed application should remain functional throughout incremental development.

---

## Mobile First

Round tracking is intended for use while physically playing golf.

Design active-round interactions for a phone first.

Prefer:

- Large touch targets
- Few taps
- Minimal typing
- One-handed interaction
- Clear hierarchy
- Automatic persistence
- Fast navigation

Do not solve mobile usability by simply shrinking desktop layouts.

Detailed shot tracking must remain optional.

---

## Data Principles

Preserve raw data wherever practical.

Do not store only derived averages when individual observations are available.

Prefer:

Raw observations
→ deterministic calculations
→ analytics
→ insights

Derived values should generally be reproducible from source data.

Avoid destructive schema changes.

Use migrations for schema evolution and preserve existing records.

---

## Golf Data

Keep the core data model vendor-neutral.

TrackMan, Uneekor, Toptracer, Foresight and future sources should map into normalized internal models.

Do not spread vendor-specific field names or assumptions throughout the application.

Vendor-specific parsing belongs in import/adaptor layers.

---

## Import Architecture

Prefer structured data when available.

Import priority:

1. Native structured file/API
2. Screenshot/image extraction
3. Manual entry

Simulator importers should normalize into the application's internal shot representation.

Adding a new simulator should not require rewriting analytics.

---

## Analytics

Use deterministic code for calculations wherever possible.

Examples include:

- Averages
- Medians
- Percentages
- Rolling averages
- Dispersion
- Standard deviation
- Trends
- Personal bests
- Goal progress
- Sample sizes
- Confidence thresholds

Analytics logic should be testable.

Do not use an LLM to perform calculations that normal application code can perform reliably.

---

## Insights

Do not generate strong conclusions from isolated events.

Pattern detection should consider:

- Sample size
- Baselines
- Multiple rounds/sessions
- Recent trends
- Consistency
- Supporting signals

Separate:

**Observation**

from:

**Possible explanation**

Do not imply causality that the available data does not support.

---

## AI

Follow this principle:

**Code reads shots. AI reads summaries.**

AI may explain or contextualize deterministic analytics.

Do not send large quantities of raw shot data to an LLM when an aggregated structured summary is
sufficient.

AI functionality should not become a dependency for basic scorekeeping, analytics, or application
operation.

---

## Goals

Do not hardcode the product around "break 90" or any specific performance target.

Goals belong to individual users.

Features and analytics should support different golfer objectives.

---

## UI / Design

Preserve the established Golf Progress visual language unless explicitly redesigning it.

Reuse existing:

- Components
- Tokens
- Typography
- Spacing conventions
- Form patterns
- Navigation patterns

Prefer extending the design system over introducing one-off styling.

Keep advanced information available without overwhelming the primary interface.

---

## Testing

Important analytics and import parsers should have automated tests.

Particularly test:

- Scoring calculations
- Penalty calculations
- Goal progress
- Aggregations
- Trends
- Import mappings
- Unit conversions
- Data migrations

For importer tests, use representative fixtures where possible.

---

## Performance

Do not repeatedly calculate expensive historical analytics on the client when they can be efficiently
queried, cached, or precomputed.

Do not prematurely optimize small datasets, but design so a golfer can accumulate years of rounds and
tens of thousands of practice shots without changing the fundamental architecture.

---

## Security

Treat all user golf data as private user data.

Enforce authorization server-side.

Never rely solely on client-side filtering to prevent one user from accessing another user's records.

Validate uploaded files and imported data server-side.

Never expose secrets or privileged credentials to the client.

---

## Scope Control

Avoid adding functionality simply because competing golf applications have it.

Before adding significant functionality, consider whether it supports:

- Capturing performance
- Understanding performance
- Measuring progression
- Reaching a goal

Features outside those areas require a clear product reason.

---

## Working Style

For substantial requests:

1. Inspect relevant code first.
2. Briefly describe the proposed implementation.
3. Identify schema/API implications.
4. Implement the smallest coherent change.
5. Run relevant tests/build/lint.
6. Fix regressions caused by the change.
7. Summarize what changed and any remaining work.

Do not leave placeholder implementations presented as completed functionality.

Do not silently remove existing features.

When requirements are ambiguous, use `docs/PRODUCT.md` to infer the intended direction before
introducing new product behavior.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

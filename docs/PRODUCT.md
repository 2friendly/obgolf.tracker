# Golf Progress — Product Specification

## Product Vision

**Don't just track your golf. Track your improvement.**

Golf Progress is a golf development platform designed to help golfers understand whether they are
actually getting better, what is preventing further improvement, and what they should work on next.

The product is not intended to compete primarily as a GPS, course-mapping, or traditional scorecard
application.

The core loop is:

**Goal → Play / Practice → Capture → Analyse → Identify → Practice → Measure**

The application should connect what happens during practice with what happens on the golf course.

---

# 1. Target User

The initial target audience is beginner-to-improving golfers who have started taking improvement
seriously.

Typical users may:

- Be working toward breaking 100, 90, 80, or another scoring target.
- Want to reduce their handicap.
- Be learning to strike particular clubs consistently.
- Use golf simulators or driving ranges regularly.
- Want to understand why they are losing strokes.
- Want evidence that their practice is transferring to the course.
- Not understand advanced golf statistics yet.

The application should remain useful as these golfers improve.

Advanced golfers should not be artificially restricted by the data model.

---

# 2. Core Product Principles

These principles should guide product and engineering decisions.

## 2.1 On-course tracking must be fast

Golfers should spend as little time interacting with their phone as possible during a round.

A normal hole should require only a few taps.

Detailed shot tracking must always remain optional.

---

## 2.2 Goals belong to the golfer

The product must not assume every golfer wants to break 90.

Users should be able to define their own goals and track multiple goals simultaneously.

---

## 2.3 Preserve raw data

Raw rounds, holes, practice sessions and individual shots should be retained wherever possible.

Derived statistics can be recalculated later.

Do not permanently reduce detailed historical data to averages.

---

## 2.4 Detect patterns, not isolated mistakes

One bad shot should not generate a coaching recommendation.

Insights should consider:

- Sample size
- Multiple rounds
- Multiple practice sessions
- Baseline performance
- Trends
- Consistency
- Supporting metrics
- Course versus simulator performance

---

## 2.5 Code reads shots; AI reads summaries

Deterministic code should calculate statistics, trends, confidence and measurable patterns.

AI should primarily interpret those results and communicate them to the golfer.

Do not send thousands of raw shots to an LLM to perform calculations that normal code can perform
reliably.

---

## 2.6 Practice and course performance are connected

Practice sessions and rounds should not exist as unrelated parts of the application.

The long-term product should answer:

**"Is what I am practising actually improving my golf?"**

---

## 2.7 Complexity should be progressive

Beginners should not be confronted with dozens of golf statistics.

The primary experience should surface the information most relevant to the golfer's current goals.

Advanced analytics should remain available for users who want them.

---

# 3. Goals

Goals are first-class entities within Golf Progress.

Users may have multiple active goals and optionally designate a primary goal.

Examples include:

### Scoring

- Break 100
- Break 90
- Break 80
- Reduce average score
- Reach a handicap target

### Course Performance

- Reduce penalties
- Increase GIR
- Increase fairways / playable tee shots
- Reduce three-putts
- Improve scrambling

### Club Performance

- Increase driver carry
- Increase clubhead speed
- Improve driver dispersion
- Improve 7-iron consistency
- Improve strike quality
- Reduce a directional miss

### Activity

- Practise a certain number of times
- Play a certain number of rounds

### Custom

Users should be able to define custom measurable goals where practical.

A goal should support concepts such as:

- Metric
- Starting value
- Target value
- Current value
- Created date
- Optional target date
- Status
- Primary / secondary designation

---

# 4. Rounds

A round consists conceptually of:

User
→ Round
→ Holes
→ Optional Shots

Rounds should support:

- Course
- Tee selection where relevant
- Round date
- 9 / 18 holes
- Players
- Notes
- Course par
- Hole pars
- Scores
- Round status
- Resume capability

Courses should be reusable.

Once a golfer creates or plays a course, it should be selectable for future rounds.

---

# 5. Active Round Experience

The active-round interface is fundamentally different from scorecard setup and post-round review.

The active-round experience must be designed **mobile first**.

Do not simply shrink a desktop scorecard.

During play, the golfer should normally interact with one active hole at a time.

A standard hole should require only a few taps.

## Minimum useful hole data

Where enabled, capture:

- Score
- Putts
- Tee result
- Penalties

Example tee results:

- In play
- Left
- Right
- OB
- Water

The golfer should never need to manually calculate statistics or penalty-adjusted metrics.

The application derives those values.

## UX requirements

The active-round interface should have:

- Large touch targets
- Minimal typing
- One-handed usability
- One active hole
- Previous / next navigation
- Automatic persistence
- Resume capability
- Clear current score
- Fast score adjustment
- Optional advanced details

The user should not repeatedly press "Save".

---

# 6. Optional Shot Tracking

Detailed shot tracking provides richer analytics but must never be required.

A shot may contain:

- Hole
- Shot number
- Club
- Result
- Distance where known
- Starting lie where known
- Penalty information
- Notes
- Data source

Useful result classifications include:

- Good
- Left
- Right
- Short
- Long
- Top
- Fat
- Thin
- OB
- Water
- Other

Example:

Par 5:

1. Driver → OB right
2. Driver → OB right
3. Driver → In play
4. 7 iron → Short
5. PW → Green
6. Putt
7. Putt

This allows the application to understand that penalties originated from the driver rather than simply
recording two generic penalty strokes.

A golfer who does not want this detail must still be able to record the hole quickly.

---

# 7. Practice Sessions

Practice is a first-class component of Golf Progress.

A practice session may occur at:

- Simulator
- Driving range
- Short-game area
- Putting green
- Other

Where launch-monitor data is available, individual shots should be retained.

A practice session should support:

- Date
- Location
- Session type
- Simulator / launch monitor source
- Clubs used
- Individual shots
- Notes
- Tags / focus area

---

# 8. Normalized Practice Shot Model

The internal shot model should be simulator-agnostic.

Potential fields include:

- Club
- Club speed
- Ball speed
- Smash factor
- Launch angle
- Backspin
- Sidespin / spin axis
- Carry
- Total distance
- Apex / peak height
- Offline distance
- Attack angle
- Club path
- Face angle
- Face-to-path
- Dynamic loft
- Strike location where available
- Source
- Original source data

Not every simulator provides every metric.

Most fields must therefore be optional.

Units should be normalized internally while allowing appropriate display preferences.

---

# 9. Simulator Data Import

Golfers should not manually enter dozens of simulator shots.

Import priority:

1. Native structured files such as CSV
2. Screenshot / photo import
3. Manual entry

## Import architecture

Simulator-specific parsing must remain separate from the core shot model.

Conceptually:

SimulatorImporter
├── TrackManImporter
├── UneekorImporter
├── ToptracerImporter
├── ForesightImporter
├── GenericCSVImporter
└── ImageImporter

Every importer should output the normalized internal shot format.

---

# 10. CSV Import

TrackMan CSV should be an early supported format.

CSV imports should:

1. Detect known formats where possible.
2. Parse individual shots.
3. Map source fields into the normalized shot model.
4. Validate values.
5. Allow the golfer to review the detected session.
6. Import the individual shots.
7. Preserve useful original/source information.

A generic CSV mapping system may later allow unsupported launch monitors to be imported.

---

# 11. Screenshot / Photo Import

Screenshot import should provide a universal fallback where structured exports are unavailable.

The intended workflow is:

1. User completes simulator session.
2. User captures one or more result screenshots.
3. User uploads screenshots.
4. Application identifies the source/layout where possible.
5. OCR/vision extracts the table.
6. Extracted values are normalized.
7. Values are validated.
8. Low-confidence values are highlighted.
9. User reviews the import.
10. Shots are saved.

Known simulator layouts should eventually use deterministic/template-based extraction where practical.

AI vision should primarily be used for unknown or difficult layouts rather than being required for
every import.

Duplicate shots from overlapping screenshots should be detected where practical.

---

# 12. Analytics

Analytics should primarily be deterministic and testable.

## Round analytics

Examples:

- Scoring average
- Score versus par
- Best round
- Recent scoring trend
- Par 3 average
- Par 4 average
- Par 5 average
- Bogey rate
- Double-bogey+ rate
- Blow-up-hole frequency
- GIR
- Fairway / playable tee-shot percentage
- Left miss percentage
- Right miss percentage
- Penalties per round
- Putts per hole
- Three-putt percentage
- Scrambling where sufficient data exists

## Practice analytics

Examples:

- Average carry
- Median carry
- Carry distribution
- Club speed
- Ball speed
- Smash factor
- Launch
- Spin
- Dispersion
- Standard deviation
- Directional bias
- Consistency
- Personal bests
- Rolling averages
- Practice volume

Where appropriate, outliers should be distinguishable from representative performance.

---

# 13. Progression

The application should emphasize progression over isolated statistics.

Examples:

Driver carry:

210m → 214m → 218m → 223m

Driver dispersion:

42m → 37m → 31m → 27m

Penalties:

4.2 / round → 3.4 → 2.7 → 1.8

GIR:

18% → 22% → 27% → 31%

The golfer should easily understand:

- Where they started
- Where they are now
- Whether the trend is improving
- How far they are from their goal

---

# 14. Insight Engine

Golf Progress should eventually contain a deterministic insight layer between raw analytics and AI.

Conceptually:

Raw Data
↓
Analytics
↓
Pattern Detection
↓
Confidence
↓
Insight
↓
Recommendation
↓
Optional AI Explanation

An insight should contain evidence.

Example:

Driver right-dispersion issue

Evidence:
- 27 tee shots across four rounds
- 22% right miss
- Four OB-right events
- Simulator dispersion also biased right

Confidence:
High

This is substantially better than reacting to an isolated bad drive.

---

# 15. Avoid Unsupported Causality

The application should distinguish observations from explanations.

Valid:

> Performance declines after hole 14.

Not automatically valid:

> You become fatigued after hole 14.

Valid:

> Your 7-iron misses right significantly more often than your baseline.

Not automatically valid:

> Your swing is over-the-top.

More detailed launch-monitor data may support stronger interpretations, but the product should not
pretend to know more than the available data supports.

---

# 16. Practice-to-Course Transfer

This is a major long-term differentiator.

The application should eventually connect simulator improvement with course outcomes.

Example:

Practice:

Driver dispersion
42m → 27m

Course:

Driver penalties
4.1 → 1.8 per round

The system should be able to identify that the player's driver practice appears to be transferring
positively to course performance.

Similarly, improvement in simulator speed without improvement in course outcomes should be visible.

---

# 17. Recommendations

Recommendations should follow evidence rather than generic golf advice.

The application should eventually answer:

**"What should I work on next?"**

Recommendations should consider:

- User goals
- Current weaknesses
- Magnitude of scoring impact
- Confidence
- Recent trends
- Practice history
- Course performance
- Simulator performance

The recommendation system should avoid changing priorities because of a single poor round or session.

---

# 18. AI Philosophy

AI is an interpretation layer, not the source of statistical truth.

Prefer:

Database
→ deterministic analytics
→ structured summary
→ AI explanation

Instead of:

Database
→ thousands of raw shots
→ LLM
→ answer

AI can eventually assist with:

- Explaining performance trends
- Summarizing progress
- Explaining why a metric matters
- Suggesting appropriate practice
- Connecting related patterns
- Answering natural-language questions about the golfer's data

The underlying statistics supplied to AI should already have been calculated by the application.

**Code reads shots. AI reads summaries.**

---

# 19. Dashboard

The dashboard should answer five questions quickly:

1. What am I trying to achieve?
2. Am I getting closer?
3. What has improved?
4. What is currently holding me back?
5. What should I work on next?

Do not display every available metric simply because it exists.

Prefer approximately 3–5 metrics that are most relevant to the golfer's current goals.

Deeper analytics can exist in dedicated views.

---

# 20. Progress Summaries

The application should eventually provide useful period summaries.

Example:

## September

- Average score improved by 4.7 strokes
- Driver carry increased 11m
- Driver dispersion decreased 8m
- GIR increased 6%
- Penalties decreased 1.3 per round
- 12 practice sessions
- 5 rounds played
- 742 practice shots tracked

Personal bests should also be identifiable.

---

# 21. Conceptual Data Model

The product should broadly support:

User
├── Goals
├── Courses
├── Rounds
│   ├── Players
│   └── Holes
│       └── Shots
└── Practice Sessions
    └── Shots

Rounds + Practice Sessions
↓
Analytics
↓
Insights
↓
Goal Progress
↓
Recommendations
↓
Optional AI Interpretation

The exact database implementation may differ, but architectural decisions should preserve these
relationships.

---

# 22. Product Differentiation

Golf Progress is not primarily:

- A GPS application
- A digital scorecard
- A launch-monitor replacement
- An AI swing coach

Those capabilities may overlap with the product, but they are not the central purpose.

The differentiation is the combination of:

**Personal Goals + Course Performance + Practice Performance + Progression + Actionable Insights**

The application should connect these pieces into one improvement story.

---

# 23. Product Decision Test

When considering a new feature, ask:

> Does this help the golfer capture, understand, or improve their golf?

And ideally:

> Does this help us determine whether the golfer is moving toward their personal goals?

Features that do neither should have a lower priority.

---

# 24. Current Development Priorities

Unless technical dependencies require otherwise:

1. Goal system
2. Mobile-first active-round tracking
3. Optional shot tracking
4. Core round analytics
5. Simulator CSV import
6. Club progression analytics
7. Goal-focused dashboard
8. Insight / pattern engine
9. Screenshot simulator import
10. Practice-to-course correlation
11. Personalized recommendations
12. AI interpretation

Build in the general order:

**Capture → Import → Analytics → Insights → AI**

---

# 25. Long-Term Product Standard

A golfer should eventually be able to open Golf Progress and immediately understand:

> This is what I wanted to achieve.

> This is where I started.

> This is where I am now.

> These areas have improved.

> This is currently costing me the most.

> This is what I should work on next.

That experience is the central purpose of Golf Progress.

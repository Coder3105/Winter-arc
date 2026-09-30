# Deterministic calculation engine — Phase 3

## Contract and boundaries

`src/server/calculations/index.ts` exports pure TypeScript functions. They depend on
neither React, MongoDB, sessions, environment variables, nor the system clock. Inputs
are plain, readonly structures. Functions never mutate measurements, persist derived
values, or round intermediate results. The server service loads owner-scoped inputs
and supplies the current time. No additional date dependency is required.

Measured, calculated, and gamification data remain separate. Reported device values
are source facts even when an estimate differs. All outputs below are calculated
values, not new measurements. No gamification, medical classification, calorie/diet
prescription, or Phase 4+ persistence is implemented. TDEE is deferred because the
existing profile has no activity factor.

Invalid numeric inputs (including NaN and Infinity), invalid dates, invalid domains,
and non-finite arithmetic outputs throw `CalculationError`, with `field` and code
`INVALID_CALCULATION_INPUT`. Positive means finite and > 0; nonnegative includes 0.
Counts are nonnegative safe integers. Required missing inputs are invalid; documented
optional/missing inputs return null. Insufficient observations are a valid result,
not an exception. API failures use the application's sanitized error handler.

All formulas return full JavaScript number precision. `roundForDisplay(value,
decimals)` is used only by presentation; it permits integer precision 0–6, uses
JavaScript rounding, and normalizes negative zero. `DISPLAY_PRECISION` defines kg,
BMI, body-fat and compliance percentages at 1 decimal, BMR at whole kcal, water at
2 decimals, and trends at 2 decimals. Derived results are never stored. Binary
floating-point comparisons in tests use tolerance-aware assertions.

## Body formulas

These functions describe estimates/differences only. In this table, w is weight in
kg, h is height in cm, p is body-fat percent, f is reported fat mass in kg, and a is
age in completed years. Display rounding follows the shared policy above.

| Function / purpose                                                                         | Formula and output unit                  | Required input validation and edge cases                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calculateBmi(w, h)` — size ratio                                                          | w / (h / 100)²; kg/m²                    | Positive w and h; no medical category                                                                                                                                  |
| `calculateBodyFatMass(w, p)` — derived fat mass                                            | w × p / 100; kg                          | Positive w; p in [0, 100]; 0 and 100 allowed; never replaces measured fat mass                                                                                         |
| `calculateFatFreeMass(w, f)` — mass difference                                             | w − f; kg                                | Positive w; f in [0, w]; zero result allowed                                                                                                                           |
| `calculateBodyFatPercent(w, f)` — inverse when source PBF is unavailable                   | f / w × 100; %                           | Same validation as fat-free mass; do not substitute for reported PBF                                                                                                   |
| `calculateMifflinStJeorBmr({weightKg, heightCm, ageYears, sex})` — resting energy estimate | 10w + 6.25h − 5a + coefficient; kcal/day | Positive w, h; integer a in [0,150]; explicit `male` (+5) or `female` (−161); nonpositive result rejected; numerical domain is not a statement of clinical suitability |
| `calculateKatchMcArdleBmr(fatFreeMassKg)` — lean-mass estimate                             | 370 + 21.6 × FFM; kcal/day               | Positive FFM required; zero FFM is unavailable for this estimate                                                                                                       |
| `calculateWaistHipRatio({waistCm, hipCm})` — ratio                                         | waist / hip; dimensionless               | Positive circumferences in matching cm; no risk classification                                                                                                         |

BMR results include `value`, `unit: "kcal/day"`, `method` (`MIFFLIN_ST_JEOR` or
`KATCH_MCARDLE`), and `kind: "CALCULATED_ESTIMATE"`. They are never averaged.
BMR equations provide estimates and can differ from device-reported values.

`compareBodyComposition(start, current)` accepts two snapshots with optional
assessment-compatible `measurements`. It returns current minus starting values:
`weightDeltaKg`, `bodyFatPercentDeltaPoints`, `bodyFatMassDeltaKg`,
`fatFreeMassDeltaKg`, `skeletalMuscleMassDeltaKg`, `visceralFatLevelDelta`, and
`waistHipRatioDelta`. Either missing/null measurement makes that delta null, not
zero. Supplied metrics must be finite/nonnegative; weight must be positive; PBF is
0–100; each component mass cannot exceed supplied weight. Inputs are not inferred
from other metrics. 45.3% → 40% is **−5.3 percentage points**, not −5.3% relative
change. Units follow each field; full precision is preserved.

## Weight analytics

`calculateWeightChange(startingWeightKg, currentWeightKg)` returns current − start
in kg. `calculateWeightChangePercent` returns (current − start) / start × 100.
Both weights must be positive. Loss is negative, gain positive, equality zero.
`describeWeightChange` adds `direction` (`DOWN`, `UP`, `UNCHANGED`) and nonnegative
`magnitudeKg` without changing the signed `deltaKg`.

`calculateGoalProgress({startingWeightKg, currentWeightKg, targetWeightKg})` returns
(current − start) / (target − start) × 100 for both loss and gain goals. All supplied
weights must be positive. `rawPercent` preserves negative progress and overshoot;
`clampedPercent` is limited to 0–100 for UI display. Missing target returns null
percentages with `NO_TARGET`. Start = target returns null with `MAINTENANCE` because
there is no distance-to-target denominator, regardless of the current weight.
Normal results have status `AVAILABLE`. Rounding follows the common % policy.

`WeightDataPoint` contains `date: string | Date` and `weightKg: number`. This is an
input contract only: no WeightRecord model or daily persistence is introduced.
Every time-series function requires an explicit timezone, validates all points
(even those outside a selected window), sorts a copy chronologically, and rejects
duplicate normalized calendar dates. The caller must supply one canonical daily
measurement; the engine never averages duplicates or guesses which is authoritative.

| Function / purpose                                             | Formula / output                                                                                                                                        | Edge cases and validation                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `calculateRollingWeightAverage(points, currentDate, timezone)` | Arithmetic mean of available weights in [currentDate − 6 days, currentDate]; `averageKg`, `sampleCount`, `windowStart`, `windowEnd`, `isSufficientData` | Positive weights; valid unique local dates. Missing dates are ignored, never filled. Empty window gives null mean and count 0. Minimum **4 measurements** for sufficient data; sparse means remain available but flagged |
| `compareWeeklyWeightAverages(points, currentDate, timezone)`   | Current [D−6,D] vs previous [D−13,D−7]; current/previous mean kg, counts, current − previous delta kg, delta / previous × 100                           | Both windows need ≥4 observations for `isSufficientData`. A missing mean gives null delta and percent. Sparse comparisons remain flagged. No single-day replacement for weekly means                                     |
| `calculateWeightTrend(points, timezone)`                       | OLS using x = calendar days since first sample, y = kg; slope = Σ((x−meanX)(y−meanY)) / Σ((x−meanX)²); intercept = meanY − slope × meanX                | At least 3 unique dates; otherwise null. Duplicates/invalid dates throw even below minimum. Actual gaps, not document indices, determine x                                                                               |

Regression returns `slopeKgPerDay`, `slopeKgPerWeek` (7 × daily slope), `intercept`
(estimated kg at the first sample date), `sampleCount`, `startDate`, and `endDate`.
`rSquared` = 1 − residual sum of squares / total sum of squares, bounded to [0,1]
for floating-point stability. A flat series has zero slope and null R² because
total variance is zero. This is a retrospective estimate, not a guaranteed forecast.
All analytics preserve full precision; trend display typically uses two decimals.

## Calendar and challenge semantics

`normalizeCalendarDate(input, timezone)` preserves a strict `YYYY-MM-DD` input as a
literal calendar label. A Date or ISO timestamp with explicit Z/offset is an instant
converted with `Intl.DateTimeFormat` to that timezone. Unsupported timezones,
impossible dates, invalid Dates, and timezone-free timestamps are rejected. Supported
date-only years are 0001–9999. `parseInstant` requires a full dated timestamp with
seconds (optional millisecond fraction) or a valid Date. Clock-only strings and
date-only strings cannot represent sleep instants.

`calendarDayIndex` maps validated Gregorian date fields onto a UTC surrogate day
index. `addCalendarDays` adds integer calendar days and validates the result. This
uses UTC solely to represent calendar fields, never to divide elapsed local time
across DST. The original setup's date parser is reused and supports early years
without JavaScript's special 1900 offset for years 00–99.

`calculateChallengeDay({startDate, currentDate, timezone, durationDays = 90})` uses
the difference between normalized calendar-day indices. Duration must be a positive
safe integer. It does not read the clock.

| Moment                  | dayNumber   | daysElapsed | daysRemaining | Status      |
| ----------------------- | ----------- | ----------- | ------------- | ----------- |
| Before start            | 0           | 0           | 90            | NOT_STARTED |
| Start date              | 1           | 0           | 90            | ACTIVE      |
| Final date              | 90          | 89          | 1             | ACTIVE      |
| Following date or later | 90 (capped) | 90          | 0             | COMPLETED   |

Elapsed means **fully elapsed calendar days**, not including the current active day;
remaining includes the active day. Progress is elapsed / duration × 100, so it is
0% on Day 1, 98.888…% on Day 90, and 100% on the next calendar day. This is a calendar
progress metric, not task completion. All counts are bounded. Other durations use
the same semantics. A DRAFT configuration's date metrics remain mathematical;
the summary separately exposes `configurationStatus`.

`challengeDayToWeek(dayOfChallenge, durationDays = 90)` requires an integer day in
[1,duration]. Week = ceil(day / 7); day in week = (day − 1) mod 7 + 1; start =
(week − 1) × 7 + 1; end = min(week × 7, duration). It returns these along with
`dayOfChallenge`. Weeks are relative to the challenge, irrespective of weekdays.
Week 13 is Days 85–90 (six days). Before/after challenge is rejected by this helper;
the summary returns a null week when the calendar status is not ACTIVE.

## Compliance and configured habits

`calculateCompliance(completed, eligible)` returns both counts, `missed` =
max(0, eligible − completed), `rawPercent` = completed / eligible × 100, and
`clampedPercent` in [0,100]. Counts must be nonnegative safe integers. Zero eligible
gives null percentages, including when completed > 0; no NaN, infinity, or false
100% success is produced. Overachievement preserves raw values above 100.

`DailyRuleState` preserves `PASS`, `FAIL`, `NOT_RECORDED`, and `NOT_APPLICABLE`.
`summarizeRuleCompliance(states, missingPolicy)` requires explicit `EXCLUDE` or
`INCLUDE` for missing entries. Eligible = PASS + FAIL, plus NOT_RECORDED only under
INCLUDE. NOT_APPLICABLE is always excluded. The returned counts retain each original
state; eligibility policy never rewrites a missing record as a failed record.

`evaluateNumericMinimum(actual, target)` compares actual ≥ target. Actual must be
nonnegative or null; target must be positive even if actual is missing. It returns
`actual`, `target`, nullable `passed`, state, `rawPercent` = actual / target × 100,
and `completionPercent` clamped to 100. Null actual returns NOT_RECORDED and null
percentages. A zero actual is a recorded failure for a positive target.

`evaluateBooleanRule(actual, applicable = true)` takes boolean or null. An applicable
true/false value is PASS/FAIL; null is NOT_RECORDED; `applicable: false` is
NOT_APPLICABLE. It preserves actual input and returns nullable `passed`. It attaches
no moral or medical judgments. No Fap is treated as a configurable binary habit
without medical claims; the same evaluator can serve No Junk Food and other habits.

| Helper / purpose                                                           | Inputs, units, formula and validation                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calculateSleepDuration({sleepStart, wakeTime, timezone})` — elapsed sleep | Explicit dated instants; valid timezone; wake ≥ start. Minutes = elapsed milliseconds / 60000; hours = minutes / 60. Returns local sleep/wake dates as context. Zero duration allowed; crossing midnight works when the actual next date is supplied. DST spring/fall nights use real elapsed time. Ambiguous local timestamps are rejected rather than guessed |
| `evaluateMinimumSleepTarget(actualHours, targetHours)`                     | Numeric minimum in hours; configured target required; default configuration is 7 hours, never hardcoded into formula                                                                                                                                                                                                                                            |
| `evaluateHydration(consumedLitres, targetLitres)`                          | Numeric minimum in litres; raw consumed / target × 100; configured target required; default configuration is 3.0 L                                                                                                                                                                                                                                              |
| `evaluateSteps(actualSteps, targetSteps)`                                  | Numeric minimum; additionally requires nonnegative safe-integer steps and positive safe-integer target; default configuration is 10,000                                                                                                                                                                                                                         |
| `weeklyCompletionPercent(completed, required)`                             | Generic compliance counts; 0/4 = 0%, 3/4 = 75%, 4/4 = 100%, 5/4 = 125% raw and 100% clamped. Zero required returns null percentages. No workout records or risk states                                                                                                                                                                                          |

All numeric helpers preserve full precision and use the common display policy.
10,000 steps and 3.0 L water are configurable Winter Arc challenge targets, not
universal medical prescriptions. Hydration does not personalize a medical target.

## Summary integration

`getCalculationContext` loads profile, current DRAFT/ACTIVE configuration, baseline,
and latest assessment in parallel using the authenticated owner's ID. Latest means
descending assessmentDate with descending ID as a deterministic tie-breaker. It
calls the pure `buildCalculationSummary`; `getCalculationSummary` returns just that
projection. Read services do not mutate measured data or persist derived values.

`GET /api/v1/calculations/summary` returns the existing success envelope and
`Cache-Control: private, no-store`. Unauthenticated access gets 401. It accepts no
browser userId. `source` contains selected latest source values; `baselineSource`
preserves baseline values separately. `calculated` includes BMI, derived fat mass,
fat-free mass and explicitly identified BMR estimates. Other calculated sections
contain available assessment changes, configured goal progress and calendar progress.

BMI uses the selected assessment's height/weight. Derived fat mass uses its reported
PBF. Calculated FFM uses weight minus **reported** fat mass. Katch uses **reported**
FFM, never silently substituting the calculated difference. Mifflin uses selected
assessment height/weight and configured profile sex/ageAtBaseline. Metadata identifies
the age basis explicitly; this is not an inferred current age or age at a later
scan. Missing profile or unsupported sex gives null Mifflin plus an `unavailable`
reason. No demographic values are hardcoded from this brief into persisted data.
Missing assessments give null source/calculations. Missing configuration/profile
gives null calendar progress. No activity factor is assumed.

The profile's read-only CALCULATED METRICS panel uses the existing SystemPanel,
metric grid, navy/black surface and cyan borders. Reported and calculated labels are
explicit. The UI explains missing Mifflin inputs and rounds at display time only.

## Baseline verification

The immutable InBody120 source (14 Aug 2026) is weight 111.1 kg, height 178 cm,
PBF 45.3%, fat mass 50.4 kg, FFM 60.7 kg, skeletal muscle 34.3 kg, BMI 35.1,
reported BMR 1681 kcal/day, WHR 1.02 and visceral fat level 25.

| Calculation                          | Full-precision example                                   | Display                       |
| ------------------------------------ | -------------------------------------------------------- | ----------------------------- |
| BMI                                  | 111.1 / 1.78² = 35.0650170433…                           | 35.1                          |
| Derived body fat mass                | 111.1 × 0.453 = 50.3283 kg                               | 50.3 kg (50.33 at 2 decimals) |
| FFM from reported fat mass           | 111.1 − 50.4 = 60.7 kg (within floating-point tolerance) | 60.7 kg                       |
| Katch-McArdle                        | 370 + 21.6 × 60.7 = 1681.12 kcal/day                     | 1,681 kcal/day                |
| Mifflin, explicit male/age 24 inputs | 10 × 111.1 + 6.25 × 178 − 5 × 24 + 5 = 2108.5 kcal/day   | 2,109 kcal/day                |

Katch-McArdle estimate closely matches this baseline assessment. This does not
establish which equation every InBody device uses. Measured fat mass stays **50.4 kg**
and reported BMR stays **1681 kcal/day**. The small rounding difference is expected.

## Verification

`npm test` includes the existing Phase 1/2 suite, body/weight/calendar/compliance
units, baseline regressions, immutable summary projections, service owner scoping,
protected-route behavior, and rendered profile labels. Date tests include leap/year
boundaries, explicit local midnights, DST spring/fall, and ambiguous timestamps.

After `npm run build`, start the production server on loopback port 3211 and run:

```powershell
npm run start -- --hostname 127.0.0.1 --port 3211
node --env-file=.env.local scripts/verify-phase3.mjs
```

The verification uses private local credentials, logs only statuses/non-secret
metrics, and logs out its own session in `finally`. It checks health, unauthorized
and authenticated summary access, unchanged baseline snapshots, and the rendered
profile. It never seeds, deletes, or updates assessment data.

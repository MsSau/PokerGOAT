# Poker Edgecraft — Product Requirements Document

**Positioning:** "Build your edge. Protect your bankroll. Master your process."

You are building the first functional MVP foundation of a web application for serious online tournament poker grinders. The product is a high-performance accountability and coaching system. It helps a serious poker player maximize long-term bankroll by consistently executing an agreed performance framework, following bankroll-management rules, identifying behavioral and technical leaks, receiving AI-assisted coaching between weekly human-coach check-ins, and improving through accountability.

Do not build a generic poker tracker, casino-style application, or gambling dashboard. The product should feel like an elite performance system: disciplined, calm, premium, minimal, evidence-based, and demanding.

\---

## 1\. Core Product Principles

1. Process is evaluated separately from outcomes.
2. Preparation influences execution; execution influences long-term outcomes.
3. Good financial results must never excuse poor discipline.
4. A losing session with excellent execution may receive strong coaching praise.
5. The player creates commitments before play and is held accountable afterward.
6. The AI augments one human coach; it does not replace the human coach.
7. The system should be consistent and boring rather than novelty-driven.
8. Serious failures must never be averaged away by high scores elsewhere.
9. Behavioral conclusions must never claim more than the evidence supports.
10. All important conclusions must be traceable to inspectable evidence.
11. Historical frameworks, rules, assessments, and Verdicts must be versioned and auditable.
12. The player cannot modify coach-controlled rules or the active quarterly Performance Framework.

\---

## 2\. User Roles

One player has one coach in the MVP.

### PLAYER

The player can:

* complete preparation check-ins;
* configure preparation behaviors and thresholds where the coach has not restricted scoring impact;
* optionally complete the in-app Pre-Game Ritual (never required to start a session);
* view the active Performance Framework and BRM rules;
* create the Weekly Game Plan for an upcoming poker week;
* create a Session Contract, generated from the locked Weekly Game Plan;
* select tournaments and receive rule validation;
* start and manually end sessions;
* log tournaments and tournament entries chronologically, including play that was not planned, not authorized, or violates BRM/Weekly Game Plan/Session Contract rules — truthful logging is never blocked;
* select mistakes from the canonical mistake taxonomy;
* propose custom Execution Actions for coach approval;
* enter text or voice journal/reflection entries;
* see running Session, Day, and Week risk information;
* receive Preparation, Execution, and Outcome Medals;
* receive an AI Verdict after completing the post-session review;
* optionally open Deep Analysis and converse with the AI coach;
* view Behavioral Profile trends;
* view assigned interventions and completion requirements.

The player cannot:

* modify the active Performance Framework;
* modify BRM rules;
* change a locked Weekly Game Plan (only append an audited amendment);
* change historical Session Contracts;
* set base severity, hard-gate status, scoring impact, escalation behavior, or detection logic for any Execution Action, including ones they proposed;
* change their own Preparation Medal thresholds or scoring rules;
* edit finalized Verdicts;
* alter coach assessments.

### COACH

The coach can:

* configure the quarterly Performance Framework;
* configure all bankroll bands and BRM levels;
* configure the Poker Day and Poker Week boundary;
* configure Session, Day, and Week Stop Loss rules;
* configure tournament slot rules and maximum buy-ins;
* configure execution actions, and approve or reject player-proposed Execution Actions;
* configure Preparation Medal thresholds and which preparation signals affect scoring;
* create and manage intervention libraries;
* map interventions to Minor, Major, and Critical severity pools;
* alter default escalation and de-escalation rules;
* alter Load Management cooldowns, concurrency caps, and autonomy mode per severity tier;
* maintain player-specific accountability information used for intervention personalization;
* view all sessions, Weekly Game Plans and amendments, Verdicts, Deep Analysis conversations, Behavioral Profile evidence, violations, interventions, and analytics;
* conduct weekly reviews;
* set up to three active coaching priorities;
* add a Coach Directive;
* override system assessments with a mandatory reason;
* approve, edit, reject, or assign interventions.

\---

## 3\. Performance Framework

Create a quarterly Performance Framework. The coach and player discuss the framework, but only the coach can create, edit, activate, or archive it.

Store:

* framework name;
* start date;
* end date;
* primary objective;
* secondary objectives (optional);
* technical focus areas (optional);
* behavioral focus areas (optional);
* success metrics;
* BRM configuration version;
* status: Draft, Active, Archived.

An active framework should remain stable. Any coach modification to an active framework requires a reason and creates an immutable audit record containing old value, new value, coach, timestamp, and effective date.

\---

## 3.5 Weekly Game Plan

The product hierarchy is: **Quarterly Performance Framework → Weekly Game Plan → Session Contract → Actual Play.**

The Weekly Game Plan sits between the quarterly Framework and individual Session Contracts. The player creates it — preferably days before the poker week begins — to cover the entire upcoming poker week. It is not the same thing as a Session Contract, and a Session Contract is never created from scratch immediately before play; it is generated from the locked Weekly Game Plan (see Section 5).

The app validates the Weekly Game Plan against: the active Quarterly Performance Framework; the locked Weekly BRM Assignment; the permitted BRM level; tournament buy-in limits; tournament slot rules; and other applicable coach-configured rules.

**The Weekly Game Plan supports at least:** poker week; planned playing days; intended tournament schedule; planned tournaments; permitted buy-ins; intended number of buy-ins; optional conditional tournaments; player-defined activation conditions for conditional tournaments; intended session allocation; weekly intention; weekly focus; player commitments; status; `created\\\_at`; `locked\\\_at`.

The Weekly Game Plan **locks before execution begins.** Once locked, the player cannot silently rewrite or delete the original plan.

### Weekly Game Plan Amendments

A locked Weekly Game Plan may be amended only through an **append-only exception process.** The original plan remains immutable and inspectable — never overwritten.

An amendment must store: `weekly\\\_game\\\_plan\\\_id`; `player\\\_id`; amendment type; original value/reference; proposed new value/reference; reason; timestamp; validation result; whether the amendment itself constitutes a violation; and the related Execution Action, if applicable.

Amendments become potential evidence for Execution assessment, escalation, Behavioral Profile, Verdict, and Human Coach Review — the same evidentiary weight as any other logged event.

\---

## 4\. BRM and Bankroll Engine

Do not hardcode BRM logic. The coach can configure all bankroll bands, BRM levels, stop-loss limits, tournament slot rules, maximum tournament buy-ins, maximum session registration exposure, and maximum buy-ins per distinct tournament.

Ship with the following default bankroll bands. Bankroll above initial capital is measured in ₹ lakh. Bankroll can be updated after every session.

|Band (₹L)|Max Buy-in/Tournament|Session Stop Loss|Day Stop Loss|Week Stop Loss|BRM Level|
|-|-|-|-|-|-|
|0–2|3|₹11,000|₹22,000|₹44,000|1|
|2–4|3|₹16,500|₹33,000|₹50,000|2|
|4–6|3|₹16,500|₹33,000|₹66,000|3|
|6–8|3|₹22,000|₹44,000|₹88,000|4|
|8–10|3|₹33,000|₹66,000|₹132,000|5|
|10–14|3|₹35,000|₹70,000|₹140,000|6|
|14–18|3|₹60,000|₹120,000|₹240,000|7|
|18–20|3|₹75,000|₹150,000|₹300,000|8|

Negative bankroll behavior is TBD and must remain configurable by the coach.

Default tournament registration rules:

* **BRM Level 1**: Max tournament buy-in ₹5,500. Max session registration exposure ₹11,000. 
* **BRM Level 2**: Max tournament buy-in ₹5,500. Max session registration exposure ₹16,500. 
* **BRM Level 3**: Max tournament buy-in ₹5,500. Max session registration exposure ₹22,000. 
* **BRM Level 4**: Max tournament buy-in ₹5,500. Max session registration exposure ₹33,000. 
* **BRM Level 5**: Max tournament buy-in ₹12,000. Max session registration exposure ₹45,000. 

Further BRM levels (6–8 registration rules) should be configurable; do not invent values for them.

**Terminology — do not conflate these two concepts:**

* **Maximum Buy-ins per Tournament** refers to a numerical limit (e.g., 2 buy-ins).
* **Maximum Tournament Buy-in** refers to a monetary limit (e.g., ₹5,500).

BRM level switches only at the weekly review boundary and is locked for the poker week. **BRM Level is assigned at the Poker Week boundary using the bankroll state at that boundary; changes to bankroll during the week do not change the active Weekly BRM Assignment.** Historical sessions retain the BRM configuration version applicable at the time.

**If no active bankroll band covers the player's current bankroll state:** prevent compliant Session Contract authorization and show "Coach Configuration Required." The player must still be able to record actual play that occurred, and such play must still be evaluated for violations — this restriction blocks *new authorized planning*, never truthful logging (see Section 5).

### Bankroll Accounting

Use an auditable opening-capital ledger entry. Capital deposits and withdrawals are stored separately from poker performance.

```
Current Bankroll = Opening Capital
                    + Cumulative Poker Net P\\\&L
                    + Capital Deposits
                    − Capital Withdrawals
                    + Adjustments
```

\---

## 5\. Session Engine

A poker day runs from 10:00 AM to 10:00 AM in the player's timezone. A poker week runs Monday 10:00 AM to the following Monday 10:00 AM in the player's timezone, by default. **The Poker Week boundary is coach-configurable; historical Poker Week configuration must be retained** for sessions logged under an earlier boundary setting. Maximum two sessions per poker day.

### Immediate pre-session player flow

```
Preparation Check-in → Optional In-App Pre-Game Ritual → Preparation Medal → Start Session.
```

The Pre-Game Ritual is part of the product, but completing it inside the app is **optional** — do not require the player to complete it before starting a session. The Preparation Medal is awarded after the (optional) ritual step and before the player starts the session. **The Session Contract is not created during this immediate pre-session flow** — it already exists, generated earlier from the locked Weekly Game Plan (below).

### Session Contract — generated from the locked Weekly Game Plan

An individual Session Contract is created from the locked Weekly Game Plan, not freely authored from scratch immediately before play. Before starting a session, the system determines or allows the player to select the relevant tournaments and commitments from the locked Weekly Game Plan.

The Session Contract must reference: `weekly\\\_game\\\_plan\\\_id`; `weekly\\\_brm\\\_assignment\\\_id`; the applicable Performance Framework version; selected planned tournaments; applicable conditional tournaments; Session Stop Loss; remaining Day Loss Capacity; remaining Week Loss Capacity; the effective Session Loss Limit; session intention/focus where applicable; `created\\\_at`; `locked\\\_at`.

The system validates the Session Contract against: the locked Weekly Game Plan; the locked Weekly BRM Assignment; the active historical Performance Framework version; remaining Day Loss Capacity; remaining Week Loss Capacity; tournament buy-in limits; tournament slot rules; maximum buy-ins; and other applicable deterministic rules.

Allow tournament substitution when a planned tournament is unavailable. The contract's original terms are immutable; substitution is a controlled, audited amendment, not a mutation of the original contract. The replacement must pass BRM validation. The Session Contract locks when the session starts. Historical Session Contracts are immutable.

The player interacts with the app post facto. The application has no direct access to poker tables or gameplay.

### Truthful Logging Is Never Blocked

This is a core product principle, not an edge case. The app may warn the player, deny authorization, flag non-compliance, or state that a tournament is outside the plan or rules — **but it must never prevent the player from recording actual play that occurred.**

The player can add and record: an unplanned tournament; an unauthorized tournament; a tournament outside the Weekly Game Plan; a tournament outside the Session Contract; additional buy-ins; play after Session, Day, or Week Stop Loss; or any other actual play that violates BRM, the Weekly Game Plan, Session Contract, or coach-defined rules.

When this occurs, the system must:

1. Accept and permanently store the actual play record.
2. Mark the record as non-compliant.
3. Create the relevant Execution Action occurrence.
4. Evaluate hard-gate status.
5. Apply deterministic escalation logic.
6. Include the event in Execution assessment evidence.
7. Include it in Behavioral Profile evidence where relevant.
8. Include it in the Verdict context.
9. Surface it in the Human Coach Overview and next Coach Review.

Violations must never be erased, hidden, or converted into compliant actions. Truthful historical logging must never be blocked.

\---

## 6\. Tournament and Entry Logging

A Tournament is a parent record. Each buy-in or re-entry is a separate chronological Tournament Entry. The player is expected to log each tournament entry as soon as it finishes.

**Tournament-level fields:** tournament number; tournament name/identifier; ITM Y/N; Final Table Y/N; best rank; worst rank; gross return/winnings; net return; comments; selected mistakes.

**Tournament Entry fields:** parent tournament; entry sequence; buy-in amount; investment; completion timestamp; return attributable to the entry where applicable; status.

Only finalized tournaments contribute to realized Session Net P\&L. Buy-ins committed to active (not-yet-finalized) tournaments are displayed separately as **Capital at Risk.**

```
Tournament Investment       = SUM(Tournament Entry buy-in amounts)
Tournament Net P\\\&L          = Gross Winnings − Tournament Investment
Running Session Net P\\\&L     = SUM(Finalized Tournament Net P\\\&L values, in chronological completion order)
Final Session Net P\\\&L       = SUM(All Finalized Tournament Net P\\\&L values)
Session Loss Contribution   = MAX(0, −Final Session Net P\\\&L)
Day Stop Loss Consumption   = SUM(Session Loss Contribution for finalized sessions in the Poker Day)
Week Stop Loss Consumption  = SUM(Session Loss Contribution for finalized sessions in the Poker Week)
Remaining Day Capacity      = Day Stop Loss − Prior Finalized Session Loss Contributions in the Poker Day
Remaining Week Capacity     = Week Stop Loss − Prior Finalized Session Loss Contributions in the Poker Week
Effective Session Loss Limit = MIN(Session Stop Loss, Remaining Day Capacity, Remaining Week Capacity)
```

Profitable sessions contribute zero to Day and Week Stop Loss consumption, and never offset losses from other sessions — each session is an independent risk unit.

Evaluate Session Stop Loss after every finalized tournament and before authorization of any new Tournament Entry. As always, unauthorized actual play can still be truthfully recorded and flagged as a violation — this evaluation gates *authorization*, never *logging*.

For the P\&L rollup, attribute cash return to the final/surviving entry; cost is spread across all entries.

\---

## 7\. Preparation Engine

The Preparation module should take approximately 30–60 seconds to complete. Use highly intuitive sliders, number wheels, large tap targets, progress feedback, streaks, satisfying micro-animations, and celebrations inspired by the interaction quality of gamified habit applications, while maintaining a premium elite-performance visual identity.

Default core preparation inputs:

* Sleep hours;
* Meditation/Pranayama minutes;
* Physical Readiness: None / Light / Full;
* Mental Priming: Purpose Review and Pre-Game Ritual;
* Impulse Control: Smoking Y/N, PMO Y/N, adequate rest/recovery Y/N;
* Optional voice/text note.

### Pre-Game Ritual ("Get into the mindset") — optional

Completing the Pre-Game Ritual inside the app is optional; the player can proceed straight from the Preparation Check-in to Start Session without it. Pacing model: 8 taps, \~3–5 seconds each, ≈35–45 seconds total. One question per card, full-bleed, swipe or tap to advance. A thin progress bar at the top — never a percentage or a count like "3/10," which creates a countdown mentality that undercuts the calm tone.

**Entry screen:** "Pre-Game Ritual. Thirty seconds. Then you play." \[Begin →]

**1 — Intent.** "What's your intent tonight?" Free-text, one line, placeholder ghost-text: *"Play my A-game."* \[Next]

**2 — Stop line.** "Where do you stop — win or lose?" Two number inputs: Stop-win ₹\_\_\_ / Stop-loss ₹\_\_\_. Pre-filled with the session's BRM-permitted Stop Loss as a starting value the player can tighten but not loosen. Muted note: "You can play tighter than your BRM limit. Never looser." \[Next]

**3 — Tournaments.** "Locked in?" Shows the tournaments already selected in the Session Contract as read-only chips. Toggle: Confirmed / Not yet — "Not yet" exits the ritual back to tournament selection rather than letting the player proceed on an unresolved contract. \[Next]

**4 — Energy check** *(pulled forward, not re-asked).* Shows the Sleep + Meditation values already logged this morning as a calm readout card. One tap: Feels right / Something's off. If "Something's off," a single follow-up chip row: Tired / Distracted / Anxious / Low motivation — logged as context, not scored. \[Next]

**5 — Name the urge.** "If tilt, greed, fear, or boredom shows up tonight — what's your move?" Chip select, editable later: Take the timer break / Stop at my line, no negotiation / Message my coach / Step away from the table for 5 minutes. This is the highest-friction screen — it does the real precommitment work. \[Next]

**6 — Identity line.** "Finish it: 'Tonight I am a player who \_\_\_'" Free-text, one line — deliberately typed, not tapped; self-authored identity statements land more effectively than selected ones. \[Next]

**7 — BRM pressure test.** "If the pull to break BRM shows up — what's your exact move?" Chip select: Close the app / Call my coach / Walk away from the table / Re-read my Stop line. \[Next]

**8 — Process definition.** "What does good process look like tonight — win or lose?" Free-text, one line. \[Next]

**9 — Ego check.** "Playing to prove something, or playing your game?" Two large tap targets, no free text: Proving something / Playing my game. If "Proving something" is tapped, no judgment copy — a quiet reflective line: "Worth noticing. Proceed when ready." \[Continue]

**10 — The Pledge.** Full pledge text displayed, calm typography, generous line spacing. Default pledge (editable by the player):

> "I show up tonight to execute, not to chase. My intent is set. My stop is decided before I see a single card. I expect the urges — tilt, greed, fear, boredom — I don't pretend they won't come. I already know my move when they do. I don't break BRM, because breaking BRM isn't who I'm building myself to be. Win or lose tonight, the process is the standard I'm judged by. That's the champion in me. That's the beast in me. Amen."

A single press-and-hold button (not a tap) labeled "I'm in" — hold \~1.5 seconds to affirm. On release: a single line drawing itself under "Champion," then fade. No confetti, no fireworks — matches the "boring, disciplined" identity rather than habit-app celebration language.

**Close:** "Locked in. See you on the other side." \[Go back to the preparation engine →]

Sleep and Meditation are the most important readiness signals. Store raw preparation data separately from the Medal. The coach can configure thresholds and medal rules in future frameworks. The Preparation Medal is shown before the player creates the Session Contract.

### Default Preparation Medal

* **Gold:** Sleep ≥7 hours AND Meditation ≥20 minutes AND at least 2 supporting preparation components completed.
* **Silver:** Sleep ≥7 hours AND Meditation ≥20 minutes AND fewer than 2 supporting components completed.
* **Bronze:** Exactly one of Sleep or Meditation below target.
* **No Medal:** Both Sleep and Meditation below target.

### Preparation Governance

The coach controls: Preparation Medal thresholds; framework-level preparation rules; which preparation signals affect scoring; preparation rules within the active Quarterly Performance Framework.

The player may personalize or add preparation behaviors/check-in items that **do not affect scoring** unless the coach approves them. The player cannot change their own Preparation Medal thresholds or scoring rules.

\---

## 8\. Outcome Medal

Do not remove BRM/hard-gate eligibility from the Outcome Medal. Evaluate in hierarchical order: Gold → Silver → Bronze → No Medal.

* **Gold:** BRM compliant AND Positive Session AND at least one Final Table.
* **Silver:** BRM compliant AND Positive Session AND ITM Rate ≥50%.
* **Bronze:** BRM compliant AND Positive Session.
* **No Medal:** Session is not positive, OR an applicable hard-gate violation occurred.

Outcome Medal remains separate from the Execution Medal, but a hard-gate violation disqualifies the player from receiving an Outcome Medal regardless of financial result. Outcome Medal measures results only. It must not be presented as proof of good technical execution.

\---

## 9\. Behavioral Profile

The Behavioral Profile is a dynamic, evidence-based longitudinal profile using six canonical dimensions: Preparation; Discipline/Process; Technical Play; Mental Game; Learning/Improvement; Results/Outcomes.

**Evidence windows:** Recent = last poker week. Short-term = last calendar month. Quarter = active Performance Framework. Long-term = full history.

Each dimension stores: current state; trend; confidence; strongest positive signal; biggest concern; recurring patterns; related coaching points; supporting evidence.

**Possible states:** Improving; Stable; Deteriorating; Insufficient Recent Data; Not Currently Observable.

Detect: repetition patterns; contextual patterns; behavioral sequences; contradictions between process and outcomes.

Behavioral categories are dynamic coaching states, not permanent personality labels. Default examples: Disciplined Grinder; Lucky Rule-Breaker; Tilt Chaser; Greed Leaker; Knowledge–Execution Gap; Improving Professional; Stagnant Grinder.

Shown on the player dashboard; can change every day if evidence says so. A player may have one Primary and one Secondary Behavioral State. Every detected pattern must contain supporting evidence, evidence window, and confidence level. Never claim more than the evidence supports. Absence of evidence is not evidence of improvement.

### Evidence-Based Dimension Index (Radar)

In addition to state/trend/confidence, maintain a separate **0–100 Evidence-Based Dimension Index** per dimension, used only for radar-chart visualization and longitudinal analytics. The index must be deterministic, use normalized evidence, be calculated separately per evidence window, and store its methodology/version for auditability.

State, trend, confidence, and radar value are separate outputs. **The radar index must not directly determine Medals, escalation, interventions, or AI coaching conclusions** — AI coaching draws on the underlying evidence, Behavioral Profile state, trend, confidence, patterns, coaching priorities, and Coach Directive, never on the radar number itself.

### Update Cadence

Recompute a provisional Behavioral Profile after every finalized session. Create an immutable **Weekly Behavioral Profile Snapshot** at the Poker Week boundary. Create an immutable **Framework-End Behavioral Profile Snapshot** when the Quarterly Performance Framework closes.

\---

## 10\. Execution Taxonomy

Four dimensions for session execution: Discipline/Process; Technical Play; Mental Game; Learning/Improvement. Preparation is upstream context; Results are downstream outcomes (Preparation maps to the Preparation module; Results/Outcomes maps to Net P\&L).

Support coach- and player-configurable Execution Actions with: name; dimension; base severity (Minor/Major/Critical); description; detection method (dropdown); hard-gate status; active/inactive status; taxonomy version.

**The canonical mistake taxonomy is built from the Execution Actions table.** Whatever is player-tagged goes into the canonical mistake taxonomy — there is one taxonomy, not two.

### Execution Action Governance

The player may propose and self-track custom Execution Actions. The player cannot configure: base severity; hard-gate status; scoring impact; escalation behavior; or system-detection logic — coach approval is what promotes a proposed action into the scored canonical taxonomy.

Maintain separate states: `PLAYER\\\_PROPOSED`; `COACH\\\_APPROVED`; `CANONICAL\\\_ACTIVE`; `INACTIVE`. Historical taxonomy versions must remain auditable.

Note: BRM Violation is a violation *category*, not a selectable Execution Action. The canonical actions are specific: Exceeded Tournament Slot Limit, Exceeded Session Registration Exposure, Playing after Stop Loss, Unauthorized Tournament, Exceeded Permitted Buy-ins, Exceeded Simultaneous Table Limits, Broke Locked Session Contract.

### Discipline / Process

|Name|Base Severity|Description|Detection Method|Hard-Gate|Active|
|-|-|-|-|-|-|
|Exceeding exposure|Critical|Session or entry breaches exposure limits|System-detected|Yes|Active|
|Playing after Stop Loss|Critical|Tournament entry logged after Session/Day/Week Stop Loss was already consumed|System-detected|Yes|Active|
|Unauthorized tournament|Critical|Entry logged for a tournament not in the Session Contract or approved substitution|System-detected|Yes|Active|
|Exceeded permitted buy-ins per tournament|Critical|Buy-in count for a tournament slot exceeds the contracted or BRM-permitted maximum|System-detected|Yes|Active|
|Exceeded simultaneous table limits|Major|Player reports playing more tables at once than their configured limit|Player-tagged|No|Active|
|Broke locked Session Contract|Critical|Any deviation from the locked contract outside the approved substitution flow|System-detected|Yes|Active|
|Exceeded permitted tournament buy-ins  |Critical|Buy-in amount for a tournament slot exceeds the contracted or BRM-permitted maximum|System-detected|Yes|Active|

### Technical Play

|Name|Base Severity|Description|Detection Method|Hard-Gate|Active|
|-|-|-|-|-|-|
|Overcalling|Minor|Called too frequently relative to hand strength or situation|Player-tagged|No|Active|
|Overbluffing|Minor|Bluffed too frequently relative to viable spots|Player-tagged|No|Active|
|Bluffed entire stack|Major|Committed full stack on a bluff in a marginal or unjustified spot|Player-tagged|No|Active|
|VPIP above target|Minor|Voluntarily-played-pot rate exceeded the coach-configured target for the session|Player-tagged|No|Active|
|Called light with tournament life at risk|Major|Made a loose call that risked elimination without sufficient equity/odds justification|Player-tagged|No|Active|
|Poor response to 3-bet|Minor|Misplayed a hand facing a 3-bet|Player-tagged|No|Active|
|Failed to fold when risk threshold required|Major|Continued in a hand where the coach-defined risk threshold called for a fold|Player-tagged|No|Active|
|Jammed weak ace at inappropriate stack depth|Major|Shoved a weak ace-x hand at a stack depth where it was -EV or unjustified|Player-tagged|No|Active|
|Poor ICM decision|Major|Decision ignored or misapplied ICM pressure in a relevant stage of the tournament|Player-tagged|No|Active|
|Damaged winning stack through unnecessary bluffing/overcalling|Major|Gave back chip lead through unforced aggressive/loose errors|Player-tagged|No|Active|
|Failed to protect stack|Minor|Took avoidable risk with a healthy stack instead of playing to preserve it|Player-tagged|No|Active|

### Mental Game

|Name|Base Severity|Description|Detection Method|Hard-Gate|Active|
|-|-|-|-|-|-|
|Lost focus after loss or bad beat|Minor|Concentration or decision quality visibly dropped following a bad beat or loss|Player-tagged|No|Active|
|Impatience|Minor|Forced action or left position due to impatience rather than sound reasoning|Player-tagged|No|Active|
|Greed-driven decisions|Major|Took unjustified risk in pursuit of a bigger result rather than the correct line|Player-tagged|No|Active|
|Chasing losses|Major|Continued playing or increased exposure specifically to recover a loss|Player-tagged|No|Active|
|Failed to accept variance|Minor|Attributed a variance-driven outcome to a false cause, resisting the process/outcome distinction|Player-tagged|No|Active|
|Continued without adequate rest|Minor|Played a session or extended play despite insufficient rest/recovery|Player-tagged|No|Active|
|Tilt/emotional decision-making|Major|Decisions were visibly driven by emotional state rather than process|Player-tagged|No|Active|

### Learning / Improvement

|Name|Base Severity|Description|Detection Method|Hard-Gate|Active|
|-|-|-|-|-|-|
|Repeated previously identified mistake|Major|A mistake already flagged in a prior Verdict/coaching point recurred|System-derived|No|Active|
|Failed to review learnings|Minor|Did not complete the post-session review/reflection step|System-detected|No|Active|
|Failed study/review|Minor|Did not complete assigned off-table study or review work|System-detected|No|Active|
|Failed to implement active coaching point|Major|An active Coach Directive or coaching priority was not observably applied|Coach-reviewed|No|Active|
|Incomplete or dishonest self-review|Major|Self-review was materially incomplete or contradicted by session evidence|Coach-reviewed|Yes|Active|

\---

## 11\. Execution Profile and Medal

Generate provisional ratings for: Discipline/Process; Technical Play; Mental Game; Learning/Improvement. Ratings: Strong; Acceptable; Weak; Critical. Do not let the AI freely invent ratings — ratings are produced by a deterministic scoring function, run per session, per dimension. The coach can override ratings with a reason; the original system-generated assessment remains stored and immutable underneath the override, never replaced by it.

The numeric Dimension Severity Score is an internal deterministic calculation only — it does not replace or become the four Behavioral Profile dimensions used for Execution assessment; those remain qualitative, evidence-based outputs in their own right.

**Step 1 — Hard gates first.** If any Execution Action logged in the session has hard-gate status = true, the dimension it belongs to is immediately rated Critical regardless of any other scoring, and the session is immediately ineligible for any medal. Hard gates always override the score-based path.

**Step 2 — Dimension Severity Score.** For each dimension, compute:

```
Dimension Severity Score = Σ (base\\\_points\\\[severity] + escalation\\\_bonus)
```

Default coach-configurable base point weights: Minor = 1, Major = 4, Critical = 10.

**Escalation bonus:** for each occurrence, add 2 × the current escalation stage index (see Behavioral Escalation Engine) of that specific Execution Action's active track at the time the session occurred. A first-time offence with no active track contributes zero bonus; a repeat offence already at Major Stage 2 contributes materially more than the same action logged for the first time.

**Step 3 — Score → Rating mapping.** Default coach-configurable thresholds:

* **Critical:** any hard-gate occurrence in the dimension, OR score ≥10.
* **Weak:** score 5–9.
* **Acceptable:** score 1–4.
* **Strong:** score = 0.

**Default medal logic:**

* **Gold:** No hard-gate violation AND all four dimensions Strong or Acceptable AND at least 3 dimensions Strong.
* **Silver:** No hard-gate violation AND no Critical dimension AND at least 3 dimensions Strong or Acceptable AND maximum 1 Weak.
* **Bronze:** No hard-gate violation AND no Critical dimension AND maximum 2 Weak dimensions.
* **No Medal:** Any hard-gate violation OR any Critical dimension OR 3+ Weak dimensions.

\---

## 12\. Behavioral Escalation Engine

Escalation is tracked per (player, Execution Action) pair — a distinct track per specific behavior. Maintain one **Player Escalation Status** = the maximum stage across all of that player's active tracks; this drives "mandatory human coach review" and Critical Alerts.

### Total stage ordering

|Index|Stage|
|-|-|
|0|Baseline (no active track)|
|1|Minor Stage 1|
|2|Minor Stage 2|
|3|Major Stage 1|
|4|Major Stage 2|
|5|Critical Stage 1|
|6|Critical Stage 2|
|7|Critical Stage 3|
|8|Critical Stage 4 — mandatory human coach review|

### Trigger conditions and precedence rule

On every new occurrence of an Execution Action, evaluate all of the following conditions against that action's history. Take the **highest-index stage among every condition that is satisfied** — never the first match, always the maximum:

* **→1 (Minor Stage 1):** first-ever Minor occurrence, track currently at Baseline.
* **→2 (Minor Stage 2):** Minor occurrence, with a prior Minor occurrence of the same action within the Recent window.
* **→3 (Major Stage 1):** EITHER a Minor occurrence persisting into the Short-term window after the track already reached Minor Stage 2, OR a first-ever Major occurrence.
* **→4 (Major Stage 2):** Major occurrence, with a prior Major occurrence of the same action within the Recent window.
* **→5 (Critical Stage 1):** EITHER a Major occurrence repeated after an explicit Coach Directive referencing this action, OR a first-ever Critical occurrence.
* **→6 (Critical Stage 2):** EITHER a Major occurrence repeated after an intervention was assigned for this action, OR a Critical occurrence with a prior Critical occurrence of the same action within the Recent window.
* **→7 (Critical Stage 3):** Critical occurrence repeated after explicit coaching or an assigned intervention for this action.
* **→8 (Critical Stage 4):** any further Critical occurrence after the track already reached Critical Stage 3. Sets the mandatory human coach review flag.

A track may jump more than one stage in a single event (severity of the specific event, not the player's full history, determines entry point). Every jump, including skipped intermediate stages, is written to an immutable **Escalation Event** record: `execution\\\_action\\\_occurrence\\\_id`; old stage; new stage; satisfied condition(s); escalation rule version; timestamp. For scoring an occurrence in the Execution Profile (Section 11), use the *post-event* escalation stage produced by that same occurrence, not its pre-event stage.

### De-escalation

Default rule: four consecutive poker days with zero occurrences of that specific Execution Action reduce that track's stage index by exactly one (using the total ordering above — e.g., Critical Stage 1 → Major Stage 2, not a reset to Baseline). Evaluated at the weekly review boundary, aligned with the same cadence as BRM level locking. After any de-escalation, recompute Player Escalation Status as the new maximum across all tracks.

Coach can configure the compliance window length and the base point weights/thresholds above; coach can override any stage transition or de-escalation with a mandatory reason, logged to the generic audit/override entity. Historical Escalation Events remain immutable regardless of later overrides — an override creates a new event referencing the one it supersedes, it does not edit history.

\---

## 13\. Verdict Engine

Every finalized session creates one immutable Verdict.

**Verdict evidence hierarchy:** Active Performance Framework → Preparation → Session Contract → Execution Profile → Violations and repeat offences → Behavioral Profile → Outcomes. Never reason from financial outcome first. Deterministically classify the session before generating AI prose.

**Default Verdict classifications:** Professional Win; Professional Loss; Lucky Escape; Deserved Loss; Mixed Session; Insufficient Evidence.

**Verdict Card structure:** Verdict Headline; What You Did Well; Where You Failed the Standard; Pattern Check; Outcome Reality Check; Next Standard.

Praise only specific, earned behaviors. Escalate tone based on repeat-offence history. The AI may be demanding, direct, and confrontational about repeated deliberate violations, but must remain respectful, evidence-based, and focused on behavior change.

Store every Verdict shown to the player. The coach can view the full Verdict history. Verdicts are immutable. Show the Verdict headline on the dashboard.

\---

## 14\. Deep Analysis

Below the Verdict Card, provide an optional "Go Deeper" action. Deep Analysis is player-initiated and conversational, supporting text and voice interaction. Deep Analysis can use: Verdict evidence; active Performance Framework; Behavioral Profile; prior coaching points; Coach Directive; relevant previous Verdicts.

Opening Deep Analysis is an engagement signal only and does not affect scoring. The human coach can see all Deep Analysis conversations. Clearly inform the player that AI coaching conversations are visible to the human coach.

\---

## 15\. Human Coach Overview — Weekly Coach Brief

The coach should understand what changed, what matters, and what requires discussion within 2–3 minutes. Include: Since Last Review; Critical Alerts; Preparation → Execution → Outcome summary; Behavioral Profile; Repeat-Offence Tracker; Learning Implementation; Financial and BRM Review; Verdict Timeline; Intervention Review. The coach should never have to hunt through charts to discover the story — the AI presents the prioritized story and links conclusions to inspectable evidence.

\---

## 16\. Intervention Engine

Use the canonical Execution Actions as triggers.

**Flow:**

```
Execution Action → Base Severity → Recurrence Check → Escalation Stage
  → Intervention Load Management → Eligible Coach-Approved Interventions
  → AI Personalization → Coach Approval or permitted Auto-Assignment
  → Completion → Effectiveness Review → De-escalation or further escalation.
```

Coach creates intervention pools for Minor, Major, and Critical severity. Interventions are configurable by coach and not hardcoded. AI can select only from coach-approved interventions.

**Autonomy modes:** Recommend Only; Auto-Assign Within Rules; Coach Only. Default MVP mode is Recommend Only.

The AI considers: Execution Action; effective severity; recurrence; Behavioral Profile; player accountability information; active coaching priorities; prior interventions; intervention effectiveness; Coach Directive. The coach retains final authority.

### Intervention Load Management

Do not assign an intervention for every qualifying trigger unconditionally. Load Management sits between Escalation Stage and Eligible Coach-Approved Interventions in the flow above.

Escalation stage tracking is never throttled by Load Management — every qualifying occurrence still advances its (player, Execution Action) track immediately and immutably, exactly as specified in the Behavioral Escalation Engine. Load Management governs only whether a new intervention is *assigned* right now, not whether the underlying violation is *recorded*.

**Default coach-configurable cadence rules, by severity tier:**

* **Minor:** no cooldown period. Cap concurrent active Minor interventions at 2. A new Minor trigger while 2 are already active is queued, not assigned.
* **Major:** cap concurrent active Major interventions at 1. Minimum 48-hour cooldown between Major assignments.
* **Critical:** bypasses Load Management entirely. Always assigned immediately, regardless of cooldowns or caps elsewhere — Critical is already tied to hard-gate and mandatory coach review, and must never be silently queued.

**Backlog behavior:** a trigger that qualifies for an intervention during an active cooldown or at cap is not dropped. It enters a per-severity backlog, ordered by escalation stage descending (highest stage first), then by recency. When a cooldown clears or an active intervention completes and frees a slot, the engine assigns from the top of that tier's backlog automatically.

**Multi-candidate resolution:** if more than one distinct Execution Action qualifies for assignment at the same severity tier simultaneously, the AI surfaces only the top 1–2 candidates (ranked by escalation stage, then recurrence count) to the coach for approval — not the full eligible list. This keeps the coach's review fast and the player's intervention load light.

Cooldown durations, concurrency caps, and backlog ordering are coach-configurable per severity tier, not hardcoded.

**Clarifications on Critical bypass:** Load Management is an intentional product requirement, not accidental scope — its purpose is to limit how many interventions can be active on a player at once, preventing intervention overload. Critical candidates bypass caps, cooldowns, and backlog waiting, but **Critical bypass does not bypass the configured autonomy mode.** Under Recommend Only, a Critical candidate immediately creates a high-priority recommendation and a mandatory coach review alert — it is not assigned until the coach approves it. When intervention capacity frees up under Recommend Only, the highest-priority backlog candidate becomes *eligible for review* and is surfaced to the coach; it is not automatically assigned. Automatic assignment occurs only under Auto-Assign Within Rules.

**Do not treat these as synonyms:** Critical Severity (an Execution Action's base severity), Critical Rating (a dimension rating in the Execution Profile), Critical Escalation Stage (Stage 5–8 on the ordered ladder), and Hard Gate (a boolean property of an Execution Action) are four separate concepts that can each independently be true or false for a given occurrence.

\---

## 17\. Player Accountability Profile

Create a configurable profile used for intervention personalization, supporting: motivators; aversions; preferred accountability methods; ineffective prior interventions; prohibited intervention types; coach notes; boundaries.

Do not invent interventions outside the coach-approved library. Do not automatically assign highly aversive interventions unless explicitly permitted by the coach.

**TBD:** whether the player has visibility into this profile is unresolved — treat as coach-only pending explicit product decision, and do not silently expose it in a player-facing screen.

\---

## 17.5 AI Service Boundaries

**Deterministic engines calculate:** bankroll balances; weekly BRM assignments; BRM validation; financial calculations; stop-loss consumption; Weekly Game Plan validation; Session Contract validation; Preparation Medal; Outcome Medal; Execution scores/loads; Execution system assessments; hard gates; escalation stages; intervention eligibility; Load Management; Behavioral Profile radar indices; deterministic Behavioral Profile evidence metrics.

**AI may:** generate Verdict prose from deterministic context; conduct optional Deep Analysis conversations; summarize evidence-supported Behavioral Profile patterns; generate Weekly Coach Brief prose; surface contradictions and discussion themes from evidence; recommend interventions only from the eligible coach-approved intervention set; suggest Coach Review agenda topics.

**AI must never override** deterministic financial rules, BRM rules, scoring, Medals, hard gates, escalation stages, intervention eligibility, Load Management, or weekly BRM assignments.

\---

## 18\. Design Direction

Desktop-first responsive web application with strong mobile usability for player logging.

Visual references: Linear for information density and hierarchy; Notion for clarity; Apple for restraint and polish; gamified habit applications for low-friction preparation interactions and celebrations only.

Do not use casino imagery, poker-chip clichés, neon gambling aesthetics, excessive gradients, or cartoonish gamification. Use generous whitespace, strong typography, restrained motion, clear status indicators, and premium analytics. The player experience should feel motivating but demanding. The coach experience should feel analytical, calm, and decision-oriented.

**The full detailed UI specification — design tokens, components, and a screen-by-screen build guide — is in Section 20 below.**

\---

## 19\. Initial MVP Build Scope

For this first build, create:

1. Authentication and Player/Coach roles.
2. Application navigation.
3. Database/data-model foundation.
4. Seed data for one player and one coach.
5. Default Performance Framework.
6. Default BRM and bankroll configuration, including the auditable bankroll ledger.
7. Player Dashboard.
8. Weekly Game Plan creation, validation, locking, and amendment records.
9. Preparation Check-in, optional in-app Pre-Game Ritual, and Preparation Medal.
10. Session Contract generation from the locked Weekly Game Plan, validation, locking, and substitution flow.
11. Tournament and Tournament Entry logging, including truthful recording of non-compliant actual play.
12. Running Session/Day/Week financial calculations.
13. Mistake selection from canonical taxonomy, including player-proposed Execution Actions pending coach approval.
14. Session completion and post-session review.
15. Deterministic provisional Execution Profile and Medal.
16. Deterministic Outcome Medal.
17. Placeholder Behavioral Profile using seeded historical data, including the Evidence-Based Dimension Index.
18. Verdict Card UI generated from deterministic mock logic.
19. Optional Deep Analysis UI with mock conversation.
20. Coach Dashboard with Weekly Coach Brief, Behavioral Profile, Verdict Timeline, alerts, and Suggested Agenda.
21. Coach configuration screens for BRM rules, Performance Framework, mistake taxonomy (including a proposed-actions approval queue), escalation rules, and intervention library.

Do not attempt to build production AI memory, autonomous behavioral pattern detection, voice transcription, sophisticated correlation analysis, or full intervention-effectiveness learning in the first pass. Create clean interfaces and service abstractions so those capabilities can be added later.

\---

## 20\. Technical Requirements

Use a modern, maintainable full-stack architecture appropriate to the selected platform. Use a relational database. Design the schema before implementing screens. Use role-based access control. Use versioning and immutable historical snapshots where specified. Separate deterministic business rules from AI-generated interpretation. Do not place critical financial calculations or medal logic solely inside AI prompts.

Create reusable services/modules for: BRM validation; Session Contract validation; financial calculations; medal calculation; Execution rating; escalation; Behavioral Profile evidence; Verdict context assembly.

\---

# 21\. UI Instructions





\# UI INSTRUCTIONS



A complete screen-by-screen specification for design and engineering, covering design foundations, global patterns, all Player screens, and all Coach screens. This is for first pass, may change later.



\---



\## 0. Design Foundations



\### 0.1 Design principle



The interface is an \*\*instrument, not an entertainment product\*\*. Every screen should feel like it belongs to a serious training environment — closer to a flight-sim debrief or a clinical dashboard than to a casino app or a gamified habit tracker. The one place warmth and encouragement are allowed to show is the Preparation ritual; everywhere else, the tone is calm, exact, and slightly demanding.



\*\*Signature element — the Evidence Chip.\*\* Every claim the system makes about the player (a Verdict line, a Behavioral Profile statement, a coaching note) is anchored by a small inline pill: a confidence level and a tap target to reveal the underlying evidence. This is the one recurring visual motif that should feel unique to this product — it's the physical manifestation of Principle 10 ("all conclusions must be traceable to inspectable evidence"). Nowhere in the app should a conclusion appear without one nearby.



\### 0.2 Color tokens



Dark-first, single theme across Player and Coach (differentiate by density and layout, not by palette — one product, two lenses).



| Token | Hex | Use |

|---|---|---|

| `--ink` | `#0A1420` | App background |

| `--surface` | `#121F2E` | Card / panel background |

| `--surface-raised` | `#182634` | Modals, popovers, active session bar, table header row |

| `--border` | `#223244` | Hairline dividers, card borders |

| `--text-primary` | `#E7EEF5` | Primary text |

| `--text-muted` | `#7C8898` | Secondary text, captions |

| `--text-faint` | `#3A4656` | Disabled, placeholder, unearned medal glyph |

| `--accent-steel` | `#5B7A99` | Primary interactive accent — links, active nav, focus rings, stop-loss meters below the caution threshold |

| `--accent-bronze` | `#9C7A4A` | \*\*Reserved exclusively for Medals\*\* — one flat color for all three medal types (Preparation, Execution, Outcome); tier (Gold/Silver/Bronze) is always spelled out in adjacent text, never encoded by shade alone. Flat, desaturated, no gradient or shine — if it looks like a poker chip, it's wrong. |

| `--signal-risk` | `#B85C4A` | Violations, Stop Loss breaches, Critical ratings, Deteriorating trend arrows |

| `--signal-process` | `#7A9B7E` | Compliant process, Improving trend arrows, Behavioral Profile radar fill/stroke |

| `--signal-caution` | `#C4A050` | Weak ratings, Stable trend arrows, approaching a limit |



Hard rule: \*\*money and medals never share a color channel.\*\* Financial figures — P\&L, stop-loss dollar amounts, bankroll — are always rendered in neutral `--text-primary`, in the mono face below, regardless of sign. No red for losses, no green for gains. `--signal-process` and `--signal-risk` exist only to describe \*process\* (discipline, execution quality, behavioral trend) — never \*outcome\*. A losing session can still render with a green-leaning Behavioral Profile radar and two bronze medals, and nothing on the screen should visually argue with that. This is the single most important color rule in the app, because it's what visually enforces Principle 1 (process ≠ outcome) rather than just stating it in copy.



Stop-loss consumption meters (see 1.3, 2.5) are the one place `--accent-steel` → `--signal-caution` → `--signal-risk` forms a gradient-like progression — that's about \*risk consumed\*, a process concept, not a judgment on the dollar figure itself, so it doesn't violate the rule above.



\### 0.3 Type system



\- \*\*Display\*\* (Verdict headlines, Medal reveals, section titles): a grotesk with restrained character — slightly condensed, confident, no display flourish. Used sparingly: headlines and medal states only.

\- \*\*Body\*\*: a humanist sans, generous x-height, optimized for dense reading (Coach Brief, Verdict Card body copy).

\- \*\*Mono\*\* (all numbers — money, timers, percentages, confidence scores, stack sizes): a monospaced face. This is a deliberate signature choice — in a product about disciplined evidence, every number should look measured, not decorative. Tabular figures, no ligatures.



Type scale: 12 / 14 / 16 / 20 / 28 / 40 (px), one weight jump per step (Regular → Medium → Semibold), never more than two weights on one screen.



\### 0.4 Layout



\- \*\*Grid\*\*: 8px base unit. Card padding 24px, section gaps 32px, page margins 48px desktop / 16px mobile.

\- \*\*Shell\*\*: persistent left rail (icons + labels, collapsible to icons-only), top bar reserved only for the active-session risk strip (see 1.3) and global search. No breadcrumb clutter — the rail is the only source of "where am I."

\- \*\*Corner radius\*\*: 6px on cards and inputs, 4px on buttons/chips, 999px only on Medal badges and status pills. No large soft "friendly app" radii (16px+) anywhere — that reads as casual/gamified, which fights the brand.

\- \*\*Density\*\*: Player screens run slightly more spacious (fewer, calmer decisions per screen). Coach screens run denser (Linear-style information density) — the coach needs to scan, not be soothed.



\### 0.5 Motion



One orchestrated moment per meaningful event, nothing ambient. Use motion for: Medal reveal (a single 400ms reveal, no confetti, no particle bursts), Verdict Card entrance (content resolves in reading order — headline, then evidence, top to bottom, \~600ms total), Pledge confirmation (the press-and-hold underline draw from the Pre-Game Ritual). Respect `prefers-reduced-motion` everywhere — replace with an instant cross-fade.



\### 0.6 Universal states



\- \*\*Empty states\*\* speak in the product's voice, not a mascot's: state what's missing and the single next action. E.g., no illustration of a sad character — a single line ("No sessions logged this week yet.") and one button ("Log a session").

\- \*\*Error states\*\* never apologize or use exclamation points. State what happened, state the fix. E.g., "Session Contract failed BRM validation. Reduce Slot 2 buy-in to ₹5,500 or below."

\- \*\*Loading\*\*: skeleton screens matching final layout, never spinners on data-heavy screens (Coach Brief, Verdict).

\- \*\*Locked/immutable content\*\* (finalized Verdicts, locked Contracts, archived Frameworks): rendered with a small padlock glyph and a muted 4% surface tint — visually distinct from editable content at a glance, without needing to read a label.

\- \*\*Coach override present\*\*: any value the coach has overridden shows a small dot indicator; tapping reveals old value → new value → reason → timestamp, using the same Evidence Chip pattern.



\---



\## 1. Global Patterns



\### 1.1 Navigation shell — Player



Left rail: Dashboard · Prepare · Plan (Weekly Game Plan) · Play (Session Contract / active session) · Log · Progress (Behavioral Profile) · Verdicts. Bottom of rail: coach-assigned Interventions badge (only appears when one is pending), a proposed-action status indicator if the player has an Execution Action pending coach approval, and account.



\### 1.2 Navigation shell — Coach



Left rail: Brief · Player · Verdicts · Behavioral · Framework · BRM · Taxonomy · Escalation · Interventions. The coach shell defaults to the Weekly Coach Brief on login — never a generic dashboard, since the whole design goal is "understand what changed within 2–3 minutes."



\### 1.3 Active-session risk strip



Whenever a session is live, a persistent top bar (not dismissible) shows, in mono figures: Session P\&L, Session Stop Loss remaining, Day Stop Loss remaining, Week Stop Loss remaining. Neutral color until a figure crosses 80% consumed, then shifts to `--signal-caution`; at 100%, `--signal-risk` with a static (non-flashing) fill. No animation on this bar — it should feel like an instrument reading, not an alert system.



\### 1.4 Role boundary cues



Anything the player cannot touch (active Framework, BRM rules, finalized Verdicts) is rendered read-only with the padlock pattern from 0.6, plus a one-line explainer on tap: "Set by your coach. Discuss changes in your weekly review." This keeps the boundary feeling like structure, not punishment.



\---



\## 2. Player Screens



\### 2.1 Player Dashboard



\*\*Purpose\*\*: orient in under 5 seconds — where do I stand, what's next.



Layout, top to bottom:

1\. Greeting line + today's poker-day window countdown (mono).

2\. Three compact stat cards: this week's Preparation Medal streak, current BRM Level (read-only, tap to see full config), Week Stop Loss remaining.

3\. Primary CTA — changes based on state machine: no contract today → "Start Preparation"; contract exists, not started → "Review Contract"; session active → "Go to Session"; session ended, review pending → "Complete Review."

4\. \*\*Session history table\*\* (last 5–10 sessions) — see component spec below.

5\. Any pending Intervention surfaces as a distinct card, never buried in the feed.



Never show cumulative bankroll total prominently on this screen — it invites outcome-first thinking on login. It's available one tap away under Progress, not on the front door.



\*\*Session history table component.\*\* Four columns: Session (ID + date/duration, mono), Medals (three glyphs in fixed P·E·O order, using `--accent-bronze` when earned and `--text-faint` when not — tier spelled out as small caption text underneath, e.g. "Gold · Gold · None," never relying on the glyph alone), Verdict (headline + one-line evidence summary), P\&L (right-aligned, mono, always `--text-primary` regardless of sign). Row order is reverse-chronological. A row can show two Gold medals next to a negative P\&L in perfectly neutral type — the medals already said what needed to be said.



\### 2.2 Preparation Check-in and Medal



Fully specified in Section 7's Pre-Game Ritual flow. The ritual is optional: after the core Preparation Check-in inputs, present two equally-weighted actions — "Get into the mindset" (enters the ritual) and "Start Session" (skips straight through) — never make the ritual the only path forward, and never visually shame the skip option (no greyed-out styling, no "are you sure" friction). The Medal reveal at the end uses the single-underline-draw motion from 0.5, in `--accent-bronze`, with the medal name in Display type and zero supporting copy beyond one earned-behavior line ("7.5 hrs sleep, 22 min meditation — both above target"). No badge shelf, no XP bar — one medal, one reason, done.



\### 2.2.5 Weekly Game Plan — creation, locking, amendment



Created days ahead of the poker week, not immediately before play — this screen should never appear in the pre-session flow. A multi-section form: planned playing days (calendar picker), planned tournaments with permitted/intended buy-ins per slot, optional conditional tournaments with activation conditions, weekly intention, weekly focus, and player commitments (free text list). Validates live against the active Framework, the locked Weekly BRM Assignment, and BRM slot/buy-in rules, using the same inline check/flag pattern as Session Contract validation (2.3).



On locking, the plan re-renders read-only with the 0.6 padlock treatment. Amendments follow the exact same append-only pattern as Session Contract substitutions (2.3): the original locked plan stays visibly intact, with each amendment appended below it, timestamped, with its reason and whether it constitutes a violation flagged plainly if so.



\### 2.3 Session Contract — generated from the locked Weekly Game Plan, validation, locking, substitution



\*\*Creation\*\*: not a blank form. The player selects from tournaments and commitments already present in the locked Weekly Game Plan — rendered as selectable cards pulled from the plan, not free-text fields. Each selected slot still shows live BRM validation inline the instant it resolves, since remaining Day/Week capacity may have changed since the plan was made.



\*\*Validation failure\*\*: the specific offending field is highlighted with `--signal-risk`, and the fix is stated in the field's own helper text (not a toast, not a modal) — e.g., under the buy-in field: "Exceeds BRM Level 3 max of ₹5,500."



\*\*Locking\*\*: on session start, the entire form re-renders as read-only with the 0.6 padlock treatment and a single line at the top: "Locked at \[timestamp]. This is your contract for the session."



\*\*Substitution\*\*: a distinct secondary action ("Substitute this tournament") available only on the locked view, opening a small side-panel — never a full-screen takeover. Requires: reason (short text), replacement tournament (re-runs BRM validation live). On confirm, the original locked contract stays visibly intact above, with the substitution appended below it as a clearly separate, timestamped entry — never edited in place.



\### 2.4 Tournament and Entry logging



A chronological list, most recent entry at top. Each Tournament is a card; each Entry within it is a compact row (sequence number, buy-in, completion time, status). "Log entry" is a floating action, always reachable in one tap from anywhere in the session.



Entry form: buy-in amount and status are single-tap chip selects wherever the value set is finite; free-typing is reserved only for genuinely open fields (comments). Mistake selection (see 2.6) is reachable from the same form.



\*\*Non-compliant entries are never blocked, only flagged.\*\* If a player logs a tournament outside the plan, an unauthorized entry, or a buy-in past the Session/Day/Week Stop Loss, the entry still saves in full — the form never disables submit and never shows a hard error that prevents saving. Instead, a persistent `--signal-risk` label ("Outside Weekly Game Plan," "Logged after Stop Loss") appears on the saved entry row, and the entry contributes an Execution Action occurrence in the background. The warning appears \*before\* submit as a heads-up ("This will be logged as outside your plan") but never as a gate — the player can always proceed.



\### 2.5 Running Session/Day/Week risk display



This is the persistent strip from 1.3, plus an expandable detail view reachable by tapping it: a simple three-row mono table (Session / Day / Week), each row showing consumed vs. limit as text, not a progress bar with color gradient — gradients here would visually resemble a casino meter. A plain ratio (`₹16,500 / ₹22,000`) in neutral color, shifting only the number's color at the thresholds defined in 1.3.



\### 2.6 Mistake selection from canonical taxonomy



A searchable, dimension-grouped picker (four tabs: Discipline/Process, Technical, Mental, Learning — matching the Execution Taxonomy dimensions exactly). Each mistake is a tappable row with its description as helper text beneath the name. Multi-select, with a running count shown as plain text ("3 selected"), not a badge.



\### 2.7 Session completion and post-session review



A short, linear flow, not a form dump: (1) confirm all entries logged, (2) confirm mistake tags per tournament, (3) one open reflection field (text or voice toggle), (4) submit. This is where honesty matters most — the tone here is the most serious in the player experience: no encouraging micro-copy, just a plain instruction ("Be specific. This is for you as much as your coach.").



\### 2.8 Execution Profile and Medal (provisional)



Shown immediately after review submission, before the Verdict. Four dimension rows (Discipline, Technical, Mental, Learning), each rendered as a single word rating (Strong/Acceptable/Weak/Critical) in text — never a star rating or numeric score shown to the player, since the underlying scoring formula is an internal mechanism. Hard-gate violations, if any, are called out above the four rows in `--signal-risk` before anything else renders.



\### 2.9 Outcome Medal



Rendered separately from the Execution Medal — different card, different position on the page (Execution Profile above, Outcome Medal below, separated by a visible divider and the label "Results — measures outcome only, not skill"). This physical separation is the visual proof that Principle 3 is structural, not just written policy.



\### 2.10 Verdict Card



Renders in this fixed order, each section appearing via the staged reveal from 0.5:

1\. \*\*Verdict Headline\*\* (Display type, classification name — e.g. "Deserved Loss")

2\. \*\*What You Did Well\*\* — bullet list, each line carrying an Evidence Chip

3\. \*\*Where You Failed the Standard\*\* — same pattern, `--signal-risk` accent on the section label only, not the whole block

4\. \*\*Pattern Check\*\* — references Behavioral Profile trend, with its own Evidence Chip

5\. \*\*Outcome Reality Check\*\* — explicitly labeled as outcome-only commentary, visually distinct (muted background tint) from the execution sections above it

6\. \*\*Next Standard\*\* — one forward-looking line, no bullet list, ends the card



"Go Deeper" appears as a single quiet text link beneath the card, not a prominent button.



\### 2.11 Deep Analysis



A conversational interface, text input with a voice-toggle mic icon. On first open ever, show a one-line disclosure banner: "Your coach can see this conversation." A persistent small icon in the composer bar reminds of this afterward without repeating the banner. Context chips above the input show what evidence is loaded into this conversation (Verdict, Framework, Behavioral Profile).



\### 2.12 Behavioral Profile trends



\*\*Primary view: a six-axis radar chart\*\* (Preparation, Discipline/Process, Technical Play, Mental Game, Learning/Improvement, Results/Outcomes — fixed order, always the same clock position per axis). Single series, single hue (`--signal-process`), flat fill at \~15–20% opacity, 1.5px stroke, on a hairline hex grid at 25/50/75/100% rings. The shape itself is the at-a-glance read.



\*\*Below the radar, a compact trend list\*\* — one row per dimension: name, trend arrow, and value. Trend arrows carry both a shape and a color, never color alone: `--signal-process` + up-arrow for Improving, `--text-muted` + right-arrow for Stable, `--signal-risk` + down-arrow for Deteriorating. "Insufficient Recent Data" and "Not Currently Observable" replace the arrow entirely with plain `--text-muted` text and no numeric value.



Tapping either the radar axis label or its trend-list row expands to strongest signal, biggest concern, and evidence — via Evidence Chips. Coach view of this same component adds the confidence level inline next to each trend row; the player view omits it.



\### 2.13 Assigned interventions and completion requirements



A simple checklist card: intervention name, what completion requires, due context (e.g., "before next session" vs. "this week"). Completed items move to a collapsed "Done" section rather than disappearing.



\---



\## 3. Coach Screens



\### 3.1 Coach Dashboard — Weekly Coach Brief



Single scrolling page, sectioned exactly in this order:



1\. \*\*Since Last Review\*\* — 2–3 line plain-language summary, generated, not a chart

2\. \*\*Critical Alerts\*\* — only rendered if non-empty; if empty, this section doesn't take up space at all

3\. \*\*Preparation → Execution → Outcome summary\*\* — the session history table component from 2.1, same P·E·O medal-glyph pattern and same neutral-money rule

4\. \*\*Behavioral Profile\*\* — the radar chart + trend list from 2.12, with confidence level added inline per row

5\. \*\*Repeat-Offence Tracker\*\* — a table: Execution Action, current stage (8-point ordering), trend arrow

6\. \*\*Learning Implementation\*\* — did the player act on last review's coaching points, yes/no/partial per point

7\. \*\*Financial and BRM Review\*\* — mono table, no charts unless the coach expands it

8\. \*\*Verdict Timeline\*\* — horizontal strip of classification chips, one per session, tap through to full card

9\. \*\*AI Conversation Signals\*\* — engagement frequency only, explicitly labeled "engagement signal, not a score"

10\. \*\*Intervention Review\*\* — active interventions and effectiveness notes

11\. \*\*Suggested Agenda\*\* — a short generated list, always last, framed as "Suggested — edit before the call"



Every section header carries a small "why this matters" affordance (tap the (i) glyph) rather than baking explanation text permanently into the layout.



\### 3.2 Coach Review Workflow



A five-stage horizontal stepper (Prepare → Validate Brief → Conversation → Decide → Close):



\- \*\*Prepare\*\*: read-only Brief view.

\- \*\*Validate AI Brief\*\*: three large tap targets — Agree / Partially Agree / Disagree — each opens an optional short note field only if not "Agree."

\- \*\*Conversation\*\*: text/voice note capture, timestamped, appended to the review record as it's typed (autosave, no explicit save button).

\- \*\*Decide\*\*: structured fields — up to three Active Coaching Priorities (chip-based, max 3 enforced with a disabled-add-state past the limit), Agreed Actions (text list), intervention decisions (select from library), optional Behavioral Profile overrides (each requires the mandatory-reason field), next review date, Coach Directive (single text field, prominent).

\- \*\*Close\*\*: renders the full Coach Review Record as an editable summary; a single "Approve and Close" action locks it.



\### 3.3 Coach configuration screens



All configuration screens (BRM rules, Performance Framework, Mistake/Execution taxonomy, Escalation rules, Intervention library) share one layout pattern:



\- \*\*List view\*\* on the left third (searchable, filterable), \*\*detail/edit panel\*\* on the right two-thirds — never full-page navigation between list and edit.

\- Every edit to a record with historical dependents triggers a \*\*mandatory-reason modal\*\* before save, writing to the generic audit/override entity — one component, reused everywhere, not bespoke per module.

\- \*\*Version history\*\* is a tab within the detail panel, not a separate page — old versions render in the 0.6 muted/locked treatment, with the audit trail inline.

\- Draft/Active/Archived status is a plain text label with a colored dot, not a full badge.



\*\*BRM configuration screen specifically\*\*: bankroll bands render as an editable table — spreadsheet-like density is the right choice here, since the coach's mental model for this data genuinely is tabular.



\*\*Taxonomy screen specifically\*\*: reuses the exact four-tab dimension grouping from the player's mistake picker (2.6) — same categories, same order. Add a fifth, always-visible tab — \*\*Proposed\*\* — showing player-submitted Execution Actions awaiting approval, each with Approve/Reject actions; approving requires the coach to set dimension, base severity, hard-gate status, and detection method before the action can move to `CANONICAL\_ACTIVE` — it never inherits defaults silently.



\*\*Escalation screen specifically\*\*: the 8-stage total ordering is always rendered as a single horizontal ladder, never as separate per-severity lists.



\---

## 22\. Feature Updates

Changelog of implementation-driven fixes, gap-fills, and clarifications made after the initial MVP build-out. The numbered sections above remain the source of truth for current behavior; entries here record *when and why* something changed, was filled in, or was clarified beyond the original spec text.

### 2026-07-21 — `perform_end_session` escalation write bug fix

Session finalization (`perform_end_session`) failed at runtime with `malformed array literal: "..."` whenever an occurrence hit any MINOR/MAJOR/CRITICAL escalation branch (Section 12). Root cause: PL/pgSQL's `||` operator is ambiguous between the anyarray||anyarray and anyarray||anyelement overloads when appending a bare string literal to a `TEXT[]` variable — Postgres resolved to the array-concat overload and tried to parse the literal itself as an array constant, which fails immediately. Fixed by switching every `v_satisfied || '...'` append to `array_append(v_satisfied, '...')`, which is unambiguous. Escalation logic itself is unchanged — this was a runtime crash fix only, shipped as a follow-up migration rather than editing the prior one.

### 2026-07-21 — Preparation Check-in UI simplification

Preparation Check-in (Section 7): Sleep and Meditation inputs changed from free-text number fields to sliders, defaulting to 7 hours sleep / 20 minutes meditation (matching the Gold-medal thresholds). Physical Readiness now carries a hover tooltip explaining what None / Light / Full mean. Impulse Control changed from three checkboxes ("Smoking today" / "PMO today" / "Adequate rest / recovery today") to two selectable cards, "No Smoking" and "No PMO"; the Adequate Rest question was removed from the check-in screen entirely. To avoid changing Preparation Medal scoring (Section 7's Gold/Silver split, which requires all three Impulse Control sub-checks clean), the Adequate Rest signal is now always submitted as compliant rather than surfaced to the player — Impulse Control credit depends only on the two remaining cards going forward.

### 2026-07-21 — De-escalation implemented (Section 12)

De-escalation was specified in Section 12 but had no implementation anywhere in the codebase. Added the evaluation function and its caller to the escalation engine, and wired the weekly evaluation into the Weekly BRM Assignment lock — creating a player's Weekly BRM Assignment for a new Poker Week is the one call site, matching "aligned with the same cadence as BRM level locking." Behavior, clarified beyond the base spec text:

* Each weekly evaluation steps a track down by **exactly one stage** once 4 consecutive poker days have started with zero occurrences of its Execution Action, counted as discrete boundary-to-boundary crossings against the player's actual poker-day boundary time (`poker_week_boundary_configs.poker_day_boundary_time`) — not a raw 96-hour duration and not the plain-calendar-day approximation the Recent/Short-term escalation windows still use. See "2026-07-22 — De-escalation upgraded to poker-day-boundary-aware counting" below.
* Because the evaluation re-runs every poker week against the track's unchanged last-occurrence timestamp, a track that stays quiet keeps stepping down on every subsequent weekly evaluation — de-escalation is not a one-time event. Enough consecutive quiet weeks walk a track all the way down to Baseline (stage 0). A single evaluation still never skips more than one stage at a time, matching the same total ordering escalation itself uses (e.g. Critical Stage 1 → Major Stage 2, never straight to Baseline in one jump) — it is the accumulation of repeated weekly evaluations, not a single big jump, that eventually reaches Baseline.
* Never blocks the BRM lock itself if it fails (best-effort, matching the pattern already used elsewhere in this system for non-critical side effects) — a missed evaluation just means the track gets another chance to de-escalate the following week.
* Every de-escalation step writes an immutable Escalation Event (satisfied condition: `deescalation_compliance_window`), the same append-only pattern escalation itself and coach overrides both use. The coach-facing Escalation screen (Section 3.3) tags these events "De-escalation" in the event history, distinct from the "Coach Override" tag.

### 2026-07-22 — De-escalation upgraded to poker-day-boundary-aware counting

The initial de-escalation implementation (above) approximated "poker day" as a plain calendar day — a raw 96-hour (4 × 24h) duration check against `last_occurrence_at`. Upgraded to count actual poker-day boundary crossings instead, resolved from the player's current Poker Week's `boundary_config_id` → `poker_week_boundary_configs.poker_day_boundary_time` (the same boundary already used elsewhere for "today" windows), falling back to the schema default (`10:00:00`) when no config resolves.

* A poker day runs boundary-time-to-boundary-time, not midnight-to-midnight. "4 consecutive poker days with zero occurrences" now means 4 of these boundary-to-boundary windows have *started* since the last occurrence — a discrete day-index difference — not a continuous 96-hour duration. Practically: a track quiet since just before its poker day's boundary time crosses into compliance sooner (relative to raw elapsed hours) than one quiet from just after that boundary, because the earlier occurrence's poker day ends sooner.
* The day-counting function itself (`pokerDaysElapsed`) is pure and interprets the configured boundary time as UTC-of-day rather than reading it off the browser's local clock (unlike `sessionContract.ts`'s `computeTodayBoundaries`, which is local-clock-based) — a deliberate simplification to keep it unit-testable without timezone-dependent flakiness. Escalation's own Recent/Short-term windows (Section 9) still use the plain-calendar-day approximation; only de-escalation was upgraded.
* No change to the "exactly one stage per evaluation, cadence-driven return to Baseline" behavior described above — only how "4 consecutive poker days" is measured.

### 2026-07-22 — Interventions simplified: single stage field, Eligibility dropped, Load Management disabled

Section 16 as originally specified routes a triggering Execution Action through Load Management, then an eligibility check (a per-action minimum escalation stage per library item), before a library item becomes assignable. It came out while explaining this flow that an Execution Action's own base severity was never actually used anywhere in the Intervention Engine, and that Load Management's cooldown/cap/backlog rules were never enforced by anything (no code populates `intervention_candidates`). Implemented instead, as a deliberate simplification:

* `intervention_eligibility_mappings` (a per-(library item, Execution Action) join table carrying its own `min_escalation_stage`) is dropped entirely. `intervention_library` now carries a single `min_escalation_stage` column directly on the item — one library item has exactly one stage threshold, regardless of which Execution Action triggers it. The per-action nuance the mapping table allowed is intentionally not preserved.
* Load Management (cooldowns, concurrency caps, autonomy mode per severity tier) is disabled at the application layer, not the schema layer: `intervention_policies` remains in the database untouched, but no screen reads or writes it anymore, and `createManualAssignment` no longer looks up a tier's configured `autonomy_mode` — it hardcodes `autonomy_mode_at_assignment` to `'RECOMMEND_ONLY'`, the MVP default this same section already specifies ("Default MVP mode is Recommend Only"). Reintroducing Load Management later is a matter of re-wiring reads/writes against the existing table, not a schema change.
* The coach-side Interventions screen (`InterventionsConfigView.tsx`) drops its "Load Management" and "Eligibility" tabs accordingly, leaving Library and Assignments. A library item's `min_escalation_stage` is editable via a labeled dropdown in the Library screen (reusing `escalationConfig.ts`'s `ESCALATION_LADDER`, the same 0–8 stage labels the Escalation screen uses) and shown for reference in the Assignments screen's intervention dropdown and list rows — manual assignment (pick player + Execution Action + library item + Assign) carries no enforcement, filtering, or auto-suggestion logic gating on stage; the coach's judgment remains the only gate, same as it already was for everything else in this flow.

### 2026-07-22 — Interventions: severity tier removed from the Library, Assignment keyed off live escalation tracks, linked from the Escalation screen

Reviewing the flow above surfaced that `intervention_library.severity_tier` (Minor/Major/Critical, set independently per library item) never actually connected to anything — it duplicated a classification Execution Actions already carry via `base_severity`, without ever being cross-checked against it. Removed entirely, together with restructuring Assignment around actual live escalation state rather than a bare Execution Action list:

* `intervention_library.severity_tier` is dropped (column and enum reference; the underlying `severity_type` enum itself is untouched, since `execution_actions.base_severity` and the dormant `intervention_policies` table still use it). A library item's only organizing property now is `min_escalation_stage`. The Library screen's list/edit form drop the Severity Tier field and tag accordingly.
* This broke the player-facing Interventions tab's severity badge (`PlayerInterventionsView.tsx` read `severity_tier` purely for badge color/label) — replaced with a badge driven by `escalation_stage_at_assignment` instead (via `escalationConfig.ts`'s `stageLabel`/`ESCALATION_LADDER`, reusing the same stage-tier coloring the Escalation screen uses), which fits the direction better than severity ever did.
* The Assignments screen's "Manual Assignment" card now auto-selects a player (first in the coach's roster, alphabetically) shown top-right, rather than requiring the coach to pick one inline in the main row every time. In place of a "Triggering Action" dropdown listing every canonical Execution Action, it now lists that player's **active escalation tracks** (sourced from `escalationConfig.ts`'s `fetchTracksForCoach`, current stage shown per track). Once a track is picked, the Intervention dropdown filters to library items whose `min_escalation_stage` is at or below that track's current stage — assignment is still entirely manual (the coach still clicks Assign; nothing auto-assigns), just scoped to what's actually eligible given where the player already is.
* The Escalation screen now links directly to this flow: next to a selected track's Override control sits an "Assign Intervention" (or "Intervention Assigned", if one is already active for that exact player + Execution Action) button. Clicking it switches to Interventions > Assignments with that player and track already selected — `CoachShell.tsx` owns the hand-off state (`AssignmentPrefill`, a `{ playerId, executionActionId, token }` object; `token` guards against the same prefill silently re-applying on an unrelated re-render).

\---


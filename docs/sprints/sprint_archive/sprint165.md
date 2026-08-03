# Sprint 165: what actually makes each of the five stats

## Goal

Five numbers describe every car: **power, handling, reliability, style, authenticity**. Each has
accreted its logic across twenty-odd sprints, and no single document says what feeds any of them.
The result is that nobody, including the people who built them, can state confidently what moves a
stat and by how much.

That is not a documentation gap. It is where bugs live. In one week of looking hard at these
systems we found: handling pegged at exactly 100 on all 26 cars regardless of build or condition;
twenty-three of authenticity's hundred points that could never be lost no matter what was done to a
car; a two-tone paint rule that ran backwards and classed flawless work as a lemon; and a repair
bill that charged the same money for one dent as for three. **Every one of those was invisible
until someone wrote down what the number was supposed to be made of.**

`docs/carstats/` becomes the single place that says, for each stat, exactly what goes into it.

## Definition of done

1. `docs/carstats/` holds one file per stat plus a README.
2. Each file gives the real formula, a plain-language explanation, and **every** input that can
   move the number, including ones with tiny effects.
3. Every claim is derived from the code and verified against actual behaviour, not copied from a
   design doc.
4. Anything found to be dead, broken, unreachable or surprising is written down as a finding.

## Reuse analysis (directive 16)

**Existing mechanisms to reuse.** All of them: this sprint writes no code and changes no value. It
reads `computeDerivedStats`, `supportRatios`, `reliabilityBreakdownOf`, the parts taxonomy's
`statWeights`, `physicalModifiers`, `gradeBandFactor`, `bandFactor`, the per-car spec fields
(`reliabilityBase`, `styleBase`, `styleCeiling`, `aeroCeiling`), the body pipeline's derived bands,
and the buyer taste model.

**Genuinely new.** Six markdown files.

## Design

**The code is the source of truth, not the design docs.** This session proved repeatedly that
design docs drift: a doc claimed `aeroCeiling` reached nothing when it was a live field; another
claimed three prose copies of a rule when there were two. Where a design doc and the code disagree,
**the code is what gets documented and the disagreement is reported as a finding.**

**Write down what does NOT affect a stat, where that is surprising.** The most valuable line in
several of these files will be a negative: performance never moves market value; the four physical
dial curves never reach price; `marketValueYen` reads no derived stat at all. A reader who does not
know these will assume the opposite and design against it.

**Plain language alongside the formula, not instead of it.** Both, every time. The formula is what
makes it checkable; the sentence is what makes it usable.

**Miniscule effects count.** If a value moves a stat by a fraction of a point under some condition,
it goes in. The point of the document is that a reader never has to wonder whether something was
left out.

**One file per stat, so a reader can hold one stat in their head.** The README carries what they
share: what a stat is for, who consumes it, and how condition reaches all five.

## Tasks

1. `docs/carstats/README.md`: what the five stats are, where they are consumed (buyers, taste,
   value, the sale verdict), what they share, and an index.
2. `docs/carstats/power.md`
3. `docs/carstats/handling.md`
4. `docs/carstats/reliability.md`
5. `docs/carstats/style.md`
6. `docs/carstats/authenticity.md`
7. A findings section, per file, for anything dead, broken or surprising discovered while writing.

## What each file must contain

- **The headline formula**, as it is actually written in the code, with the file and symbol named.
- **A plain-language paragraph**: what this number means about a car, in a sentence a player would
  recognise.
- **Every input**, each with: where it comes from, how big its effect is, and whether it is
  per-car, per-part, per-band or global.
- **The bounds**: what the stat can actually reach, at floor and ceiling, and what it takes to get
  there.
- **What does not affect it**, where a reader would reasonably assume otherwise.
- **Where the content levers live**, by file and key, so a tuner knows what to turn.
- **Findings**: anything dead, unreachable, contradictory or surprising.

## Levers (directive 22)

**None. This sprint changes no value and no code.** If it finds a value that looks wrong, that is a
finding written into the doc and reported, never a change.

## Exit

Written. `docs/carstats/` holds a README and one file per stat, 1,700 lines in total, every claim
derived from the code and the numbers measured through the shipped functions rather than read off a
design doc. No code, content, test or value was touched.

**The sprint paid for itself in findings.** The premise was that writing down what a number is made
of is how you discover it is wrong, and that held on every one of the five.

**Live defects found:**

- `hasForcedInduction` reads `model.tags` alone, and the roster CSV authors induction in its own
  `aspiration` column while leaving `tags` blank on all 68 unbuilt rows. A turbo car imported
  without a hand-written tag silently reads NA, takes NA power fractions everywhere, and nothing
  fails. `spec.aspiration` exists on `CarModel` as a second copy that only a dev screen reads.
- Fitting a body kit charges twice. The carrier swap leaves every panel zone bare, so `paint`
  re-derives to `poor` and drags the style and authenticity condition factors down on top of the
  stockness the kit already costs: authenticity 100 to 83 where stockness alone predicts 89, style
  92 to 84. The second charge is invisible in the UI.
- A fitted aero part replaces a car's factory downforce figure rather than adding to it, so a race
  wing DROPS the Honda City E from 41 handling to 30, and a street lip kit is a net handling loss
  on 11 of the 26 shipped cars.
- The dyno sheet rounds each loss term independently, so its four displayed integers can sum to 91
  against a base of 92.
- `chassis`'s authenticity point can be lost at generation and never recovered: the slot is
  `removable: false` and not body-derived, so no install path exists.

**Dead or unreachable content found:** `machiningCost` returns literal 0 unconditionally while the
design doc tables a full cost scale; `tierDelta.grand` (+0.075) maps to no tyre grade and no roster
car; both arms of authenticity's clamp are unreachable; a big brake kit and a race steering rack
move handling by exactly zero on all 26 cars.

**Structural surprises worth knowing rather than fixing:** support does not gate power, verified
twice independently; reliability's condition factor is decided by its single worst part and does
not stack, so repairing three light parts while a heavy one is poor moves nothing; a part worth
zero power still costs power as it wears, because occupying a weighted slot puts its band in a
denominator; ruining a part costs more authenticity than replacing it with aftermarket; and style
correlates with performance at r 0.69 on the shipped cars despite a formula that reads no
performance figure at all, because the authored columns track price.

**Paint is the single biggest hole**, and it took documenting two stats separately to see it: the
slot carries 11 of authenticity's 100 points and 2 of style's 14 condition weight, and it is the
only slot in the game with no aftermarket SKU at any fitment class. It is pure subtraction on both
stats and a respray can never win a point back on either.

**Roughly a dozen design-doc passages contradict the code** and are listed in the relevant files.
Notably `tuning-system.md` describes style as additive, cites the retired `styleCap`, shows one NA
power column where the code has two, calls the ECU a threshold that unlocks other parts when no
unlock exists, and still gives reliability's retired formula. `economy.ts`'s own Zod comment on
`styleSaturationPoints` describes ten slots and 88 points against a measured twelve and 108.
Nothing was changed to match: the code was documented and the disagreements recorded.

None of the above was fixed in this sprint, by design. Each is a finding for the maintainer to
triage.

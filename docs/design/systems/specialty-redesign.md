# Specialty, redesigned

**Status: PAUSED by the maintainer, 2026-08-03.** "We don't know what it needs to be yet, and we
need to do a better job designing it." Nothing here is built and nothing here is agreed. This is a
record of a design conversation that did not converge, kept so the next attempt starts further
along than the last one.

The analysis of what exists today is `specialty-crediting-analysis.md` and that part IS reliable:
it is a code read, not a proposal.

## Why it did not converge

Three ideas were proposed and rejected in turn, and the rejections are the useful part.

**Labour efficiency: rejected.** "For what purpose? Just to get more done in a day? So what? Still
doesn't get you anything." The principle behind the rejection is worth keeping: **a rate multiplier
changes how fast, never what.** In a turn-based game with no time pressure, compressing time
produces nothing a player can point at. The same objection kills material yield.

**Sharper diagnosis: rejected**, already planned as a staff perk.

**Teardowns preserving parts: not chosen.**

**Builds exceeding the catalogue, and machining costing less originality: chosen, then paused
with everything else.** The pair was heading somewhere: mastery extracts more from a part AND
preserves more of the car's originality, both through machining. It stalled on a real structural
problem, recorded below.

## What is actually settled

**The diagnosis.** Specialty feels weak because the bible confines it to DEPTH: offer mix, in-lane
pay, techniques, shop title. Every one of those is a service job. You can be the best engine builder
in the city and it changes nothing about buying a car, fixing it, or selling it. That is the design
working as written, not an implementation failure.

**Crediting is broken independently of the above**, and this part is a plain fault rather than a
design question. Nothing credits specialty for work performed; `state.specialty` is written only
when a job or mission resolves, and a mission's groups are a hand-authored tag with no link to its
own requirements. The tutorial paid 15 Body points for tyre and engine work because `four-wheels`
carries `specialtyGroups: ["body"]`. **This is worth fixing whatever the redesign concludes.**

**Value cannot come from performance.** `marketValueYen` reads no derived stat, so any "your work is
worth more" mechanic must run through authenticity or style, never through power or lap time.

**The UI already promises something it does not deliver.** `StandingScreen.vue` renders "Blueprint
engine building unlocks at 120 pts", and what that technique unlocks is `unlocksTemplateIds`: one
service-job template. The player is told they are earning a craft and is given a phone call.

## The structural problem the next attempt has to solve

Mastery has six disciplines. Machining is an engine operation with a little drivetrain. **Suspension,
wheels, body and interior have no craft operation at all**, so any mechanism hung on machining works
in one and a half disciplines out of six.

The six techniques ARE the missing operations, by name: corner weighting, show fitment, one-off
panel fabrication, bespoke trim. They are currently wired to service-job templates rather than to
the player's own cars. **Whether rewiring them is the answer was not decided.**

## Open, and unresolved

- What mastery gives that is felt, measurable and not a rate multiplier.
- Whether the six disciplines are the right six. The maintainer raised this and it was not answered.
- Whether the progression bible needs its fourth amendment at all, which depends entirely on the
  above. The draft amendment below was written for a design that is no longer agreed.
- Tier names, tier count, and whether a tier can be lost.

---

**Everything below this line was drafted before the pause and is NOT agreed.** It is kept for the
reasoning, not the conclusions.

## The problem, stated correctly

Specialty feels weak, and the reason is not an implementation failure.

The bible confines specialty to DEPTH: offer mix, in-lane premium pay, techniques, shop title. Every
one of those is a service job. **So you can be the best engine builder in the city and it changes
nothing about buying a car, fixing it, or selling it. It only changes which phone calls you get.**

The system is doing exactly what it was designed to do. The design was drawn too narrowly.

A second fault compounds it: **nothing credits specialty for work you actually performed.**
`state.specialty` is written only when a job or mission resolves, and a mission's groups are a
hand-authored tag with no link to its own requirements. The tutorial paid 15 Body points for tyre
and engine work because `four-wheels` carries `specialtyGroups: ["body"]`.

## The amendment

**Fourth amendment to the progression bible, for maintainer approval:**

> **Specialty may gate labour and material efficiency WITHIN ITS OWN DISCIPLINE.** The pillar table
> previously reserved throughput to Capability and forbade specialty from touching repair speed or
> repair cost. That confinement is what made specialty a service-job side stat rather than a
> progression axis, and the first law is unaffected: nothing basic is ever locked, because
> efficiency is never permission.
>
> **Capability keeps its exclusive claim on parallelism, ceilings and cross-discipline throughput.**
> A tool tier still decides what work is possible at all and how many cars run at once. Specialty
> only makes the work you have chosen to be good at cheaper in time and material, in that one
> discipline. Two axes on one dial, deliberately, because they answer different questions: what the
> shop can do, and what these hands are good at.

**On vocabulary.** `levels/leveling` is banned and stays banned. Specialty gains **named tiers**, on
the model reputation already uses (unknown, local, known, respected, legend). A tier is a name, not
a level.

## How specialty is earned

**Labour points spent, credited to the group of the thing you spent them on.** Rebuild a head, the
engine credit is the labour the rebuild cost. Fit four tyres, wheels. Respray a wing, body.

Three reasons this is the right unit:

- **Ungrindable by construction.** Labour is already capped per day, so there is no way to farm
  points by repeating something cheap. No anti-grind rule needed, because the scarce resource is
  the meter.
- **It weights work by difficulty for free.** An engine-out rebuild earns what it cost you; a filter
  change does not.
- **Every action already carries it.** Repairs, pipeline stages, teardown, refit and machining all
  have a labour cost attributed to a part or an assembly, and every one resolves to a group.

**Mission and job specialty crediting is deleted**, along with `specialtyGroups` from the mission
schema. The mislabelled `four-wheels` tag stops mattering rather than needing a fix.

**This separates the two axes cleanly, which they are not today:**

| | earned by | answers |
| --- | --- | --- |
| **Reputation** | jobs and missions completing | what the town thinks of you |
| **Specialty** | labour through your own hands | what you are actually good at |

## What a tier gives

Three things, none of them permission.

**1. Labour efficiency in-lane.** Work in your strong discipline costs less labour. The highest
impact of the three: labour is the binding constraint, it is felt every single day, and it makes
specialising a real trade-off because a generalist is slower at everything.

**2. Material yield in-lane.** More panels per tin of filler, more car per tin of paint.
**Depends on consumables becoming stock you buy**, which is separately on the list. Until that
lands, this half of the amendment has nothing to attach to.

**3. Techniques.** Reworked below.

**Dropped: the in-lane payout premium and the title bias multiplier.** Two invisible multipliers on
a lane the player barely sees. Three thresholds doing subtly different things to the same phone
calls is bookkeeping, not progression. The shop title stays as a name you earn; its 1.25x offer
multiplier goes.

## Techniques reach your own cars

Today all six unlock a service-job template and nothing else, so a technique is a phone call. Each
keeps its template and gains something you can do to a car you own:

| technique | discipline | on your own car |
| --- | --- | --- |
| Blueprint engine building | engine | more from the same parts: a blueprinted build exceeds what its grade normally delivers |
| Dog-box conversion | drivetrain | fit a dog box, a part that does not otherwise exist |
| Corner weighting | suspension | a setup step that buys handling no part sells |
| Show fitment | wheels | aggressive fitment: more style from the same wheels |
| One-off panel fabrication | body | make a panel instead of buying one, which matters most on the rare cars whose panels are dear or absent |
| Bespoke trim | interior | make interior instead of buying it |

**This is the half that needs no amendment.** Techniques are "access, never a stat" in the bible's
own words, and it does not say access to what.

## Levers (directive 22)

**NOT YET APPROVED. Nothing may be implemented until every value below is signed.**

| lever | file | proposed |
| --- | --- | --- |
| specialty earned per labour point | `economy.json` | 1 |
| tier thresholds (5 named tiers) | `economy.json` | to be set against the labour pool |
| labour discount per tier | `economy.json` | to be set |
| material yield per tier | `economy.json` | blocked on consumables as stock |
| technique threshold | `techniques.json` | rescaled from 120 |
| in-lane payout premium | `economy.json` | deleted |
| title bias multiplier | `economy.json` | deleted |

## Order of work

1. **The bible amendment**, approved and recorded. Blocks everything.
2. **Specialty earned from labour**, tiers named, mission and job crediting deleted.
3. **Labour efficiency in-lane.**
4. **Consumables as stock** (its own design), then **material yield**.
5. **Techniques reaching your own cars.**

## Open

- **Tier names.** Five per discipline, and they are player-facing copy on the maintainer's own
  quality bar, so they get swept rather than accepted from a first draft.
- **Whether a tier can be lost.** Reputation can fall. Nothing here says whether neglecting a
  discipline decays it, and a decaying specialty punishes the generalist twice.
- **The shop title's threshold** once the premium and bias multipliers it shared are gone.

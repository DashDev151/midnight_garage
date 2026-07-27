> **ARCHIVED.** A proposed per-lot readout scoring every available play in yen per day of labour. Rejected by the maintainer; nothing supersedes it, and it must NOT be rebuilt unless the maintainer raises it first. Kept as the historical record; do not read it as current.

# The Decision Report

**Status: PARKED, not to be rebuilt without the maintainer raising it first.**
**Maintainer ruling 2026-07-26: "you do not understand the game well enough to build this. this is
the broken bot system all over again."**

Retained only so the idea is not re-proposed. The reasoning below is the reason it was killed, not a
plan.

## What it was going to be

An enumeration of the plays available on each lot on a given day, each scored closed-form in yen per
day of labour, with the spread between the best and worst play as the headline: a spread near zero
meaning the decision was filler.

## Why that is the bot failure wearing a different hat

`TODO.md` already contains the sentence that kills it: **a bot is a test wearing a costume.** It
encodes a strategy somebody already wrote down, so it can only report how well that guess plays.

A scoring function is the same object. This design would have hard-coded three separate guesses about
a game its author does not understand well enough to guess about:

1. **Which plays exist.** Seven were picked. If the interesting play is one not on the list, the
   report cannot see it and will confidently report that the decision is fake.
2. **What a play is worth.** Yen per day of labour was chosen as the ranking currency. That is a
   theory of what the player is optimising, asserted rather than observed.
3. **That spread means interest.** A decision can be close-run and dull, or lopsided and gripping
   because of what it costs elsewhere. Spread is a proxy for a thing nobody has defined.

Each guess is invisible in the output. The report would return confident numbers, and the numbers
would then be used to justify moving economy levers, which is how a misunderstanding becomes
permanent. That is strictly worse than having no instrument: a wrong instrument is trusted.

The bot harness failed the same way and took fifteen sprints to be recognised as failing. It also
looked reasonable at the design stage.

## The standing conclusion

Understanding of whether this game's decisions are interesting comes from the maintainer playing it.
It does not come from an instrument built by someone who has not. Build measurement for things with a
defined right answer (arithmetic coherence, physics against telemetry); do not build it for judgement
calls.

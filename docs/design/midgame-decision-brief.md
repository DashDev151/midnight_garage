# Mid-game decision brief

**Status: DECIDED (maintainer, 2026-07-23), except D3 pending an explanation-then-pick.**
D1: (a), the collector network stays dark until legend content lands, deliberately.
D2: ALL traits stay exactly as they are, parked: the systems get built around them later so
they mean something; the traits are promises, not bugs.
D4: both approved: guarantors first (integrated with the auction progression), then the
Master Inspector.

Original brief below for the record. Five decisions from
the progression map's ranked holes (`docs/design/progression-map.md`), each with options and
the orchestrator's recommendation, phrased to be answerable from a phone. Everything here is
implementable without a playtest; nothing proceeds without the pick, and any option that
moves an economy number gets its lever listed for sign-off before implementation
(CLAUDE.md directive 22).

## D1. The collector-network tier opens onto an empty room

The gate fires at `respected` (500 rep); zero legend-rarity cars exist, so the tier never
stocks a lot.

- (a) Leave it dark until Hall of Legends content lands: a known broken promise meanwhile.
- (b) Hide the tier entirely until legend content exists: no empty room shown, honest, cheap.
- (c) Stock it meanwhile with collector-grade rolls of EXISTING rare models: cherished-tier
  provenance, high authenticity, near-clean condition: the venue where the best examples of
  cars you already know surface. Zero new car art; generation rules only.

**Recommendation: (c)**, with (b) as the stopgap if (c) waits: a rung must reward the climb.

## D2. The dead staff traits (players can hire them; they do nothing)

- ex-pro-driver: (a) wire into the lap model (a trait modifier on lap seconds: NOTE this
  touches two mission requirements, so the exact modifier is a directive-22 lever needing
  sign-off), or (b) pull from the roll pool until the lap/drive arc.
- night-owl: its trigger (evening events) does not exist as a mechanic: (a) pull from the
  pool, or (b) redefine against a real trigger.
- gaisha-fluent: no import car can exist: (a) pull from the pool until imports do.

**Recommendation: wire ex-pro-driver (small, real, lever presented before landing); pull
night-owl and gaisha-fluent from the roll pool** (content-only, reversible the day their
mechanics exist).

## D3. The dead `AUCTION_TRAVEL_FEE_YEN` block

- (a) Delete it (the diagnosis visit fees already do this job).
- (b) Wire it as an additional venue travel cost.

**Recommendation: (a) delete.**

## D4. The next feature sprint while playtesting waits

Both are real mechanics work, fully doable without a playtest:

- (a) **Auction Guarantors** (maintainer-authored design, now unblocked: the economy
  legibility arc it queued behind is long done): three personas and three missions replace
  the passive rep gates on regional/premium/collector-network. Heavy authored copy, which
  reviews well on mobile.
- (b) **Master Inspector** (ruled v1.0): the hireable who walks the optimal diagnosis route
  for you: the engaged player's edge stays free, the disengaged player buys theirs. A trait
  plus one resolver; the route-walker brain already exists in the probes.
- (c) Both, sequenced (state the order).

**Recommendation: (c), guarantors first**: they fix a progression hole and their missions
give the mid-game beats the map says are missing; the Inspector follows as a compact sprint.

## D5. Parked explicitly (no decision needed now, listed so silence is deliberate)

The `legend` rung's meaning and the import broker both belong to the endgame/Hall of Legends
arc; the map records them; nothing pretends otherwise meanwhile.

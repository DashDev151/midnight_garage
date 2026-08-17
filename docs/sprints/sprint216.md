# Sprint 216: latents, grenades, and the fearful room

**Status: APPROVED.** Implements sections 2, 3 and 4 of
`docs/design/systems/knowledge-and-diagnosis.md`. Depends on Sprint 215
(verification is the reveal trigger).

## Reuse analysis (directive 16)

**Reused:** the whole CarSymptom machinery (latent is one flag on it);
generation's damage/provenance rolls for latent weights; failure modes'
`setBand` writing (a latent writes its band exactly as visible symptoms already
do); `taskLaborChain` for candidate fix costs; the existing room-estimate path
("the room says") for fear pricing; the existing symptom weights for severe-cause
prevalence; the yard tests unchanged as the grenade-discovery instrument
(screening mechanic REJECTED, rulings ledger item 4: do not build it).

**New:** `CarSymptom.latent`, latent generation weights, the `fearBias` room
formula, severe-cause weight retune.

## Tasks

### A. Latents (spec section 2)

- A1. `latent: boolean` on `CarSymptom` (save bump shared with the arc). Rolled
  at generation: initial 25% one / 5% two, provenance-modified (garage-kept
  10%/0%; crash and flood higher: values content, `latentRoll` block).
- A2. A latent: absent from every list and every discount (player and room);
  host slot shows its prior (215 machinery).
- A3. Reveal on the true cause's slot verifying (any 215 route): surfaces as an
  identified fault (no candidate list), slot band corrects to `setBand`.
- A4. Scrap-band latents ALLOWED (ruling 3); silent scrap latents rare: their
  weight inside the latent roll is a fraction of poor/worn latents (content).

### B. Grenade prevalence (spec section 3)

- B1. Severe (scrap-band) failure modes gain generation weight inside ordinary
  VISIBLE symptoms' candidate lists, per symptom family (content retune of
  `symptoms.json` weights; felt statement: "a grenade usually announces itself:
  the knock is on the card; whether it is the ¥300 fix or the engine is what the
  yard tests are for").
- B2. Yard tests unchanged: verify that each severe mode is discriminable at the
  yard at least one partition step (probe: for every severe mode, some yard test
  separates it from at least one cheap sibling).

### C. The fearful room (spec section 4)

- C1. `fearBias` (content, initial 0.85). Room pricing of each unresolved
  symptom: `fearBias x maxCandidateFixCost + (1 - fearBias) x weightedMeanFixCost`,
  chain-priced candidates, applied wherever the room's estimate is built (the
  auction "the room says" figure and hammer behaviour derive from it).
- C2. The player's own estimate keeps their actual knowledge: weighted mean over
  THEIR open candidates; exact cost once collapsed. The existing room-vs-yours
  display carries the spread; no new UI.
- C3. Probes: (a) on a symptom whose candidates span cheap..grenade, the room's
  figure sits within a stated band of the worst case; (b) a collapsed-cheap
  diagnosis puts the player's number above the room's by at least the spread the
  bid guidance claims; (c) a collapsed-grenade puts it below.

### D. Fallout

- Directive 17 discipline. Auction pricing/golden pins move (room formula):
  re-derive per convention. Story-mission price-locks re-derive mechanically if
  the room figure feeds them (check `storyMissionProbes`' helpers).

## Definition of done

- Latents roll, hide, reveal, and can be scrap; grenades appear on visible cards
  at the retuned weights and are yard-discriminable; the room fears the worst by
  the formula; all three C3 probes green.
- `pnpm typecheck`; narrowest tests once.

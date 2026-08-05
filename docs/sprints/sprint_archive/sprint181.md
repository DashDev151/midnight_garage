# Sprint 181: taking the old system out

**Arc:** `docs/sprints/scene-standing-arc.md`. Step 8, and the last of it.
**Design of record:** `docs/design/systems/scene-standing-refactor.md`, sections 2 and 10.

Deleted outright, not migrated. Directive 19: there are no players and no old saves, so nothing here
is preserved for compatibility.

## Goal

**The component-group specialty system stops existing**, and the bible says what standing now means.

## What comes out

**31 files mention specialty.** The load-bearing ones, verified:

| where | what goes |
| --- | --- |
| `serviceJobs.ts` | `freshSpecialty`, `topSpecialtyGroup`, `applySpecialtyDelta`, and the offer bias, in-lane premium and title derivation reading it |
| `missions.ts` | the `applySpecialtyDelta` call and the `specialtyGroups` read |
| `storyMissions.json` | `specialtyGroups` on **all ten** missions, and the field from `storyMission.ts` |
| `economy.json` | the whole `specialty` block: `biasFactor` 0.5, `softcapPoints` 100, `premiumThresholdPoints` 40, `inLanePremium` 1.15, `titleThresholdPoints` 80, `titleBiasMultiplier` 1.25 |
| `techniques.json` and `techniques.ts` | six techniques at `thresholdPoints` 120, each with `unlocksTemplateIds`. **The six names live on as the operations** built in sprint 180 |
| `gameState.ts` | the `specialty` record |
| `specialtyCopy.ts` and its JSON | per-discipline copy |
| `StandingScreen.vue` | the old display, replaced by or grown into the ledger |

**Check the whole list before deleting**, including `advanceDay.ts`, `newGame.ts`, `context.ts`,
`provenance.ts`, `DevConsole.vue`, the two complete-modals, `saveCodec.ts` and the bot career
harness. The count is 31 and this doc names about a dozen.

## The one thing that must NOT be deleted carelessly

**The six technique names are not dead**: they became the craft operations in sprint 180. Only the
threshold mechanism, the point track and the service-job unlock wiring come out. If sprint 180 has
not landed, this sprint cannot start.

## The tutorial

**No tutorial copy is touched.** It teaches take the job, buy a car, diagnose it, fix it, hand it
over, and none of that changes. Deleting `specialtyGroups` from `four-wheels` removes the credit,
and the persona archetype added in sprint 178 supplies the replacement.

**Verify the tutorial still passes end to end**, including `tutorialProbe.test.ts`'s budget check,
because that probe is sensitive to changes it does not obviously touch.

## The bible amendment

`docs/design/progression-bible.md` is locked and this is where the approval is spent, once.

- **The horizontal axis is redefined**: specialty is standing within buyer scenes, earned by matched
  deliveries, expressed as clientele behaviour and craft operations.
- **Result quality is specialty's domain.** Rate, cost and access remain forbidden to it: not how
  fast, not how cheap, not whether. How well.
- **Value never reads performance** is unchanged, and now stated precisely: value never reads
  *stats*; stats route through taste.
- **Nothing basic is ever locked** is unchanged; operations are additive capability.
- **Banned vocabulary** is unchanged and complied with. The system says scene, standing, stage,
  deed, ledger, operation.

Record the amendment in the doc itself, in the style of the three that came before it.

## Reuse analysis (directive 16)

Nothing is built here. **The risk is the opposite of the usual one**: leaving a fragment of the old
system alive that quietly keeps working, or deleting something the new system turned out to need.

The mitigation is that sprints 176 to 180 all land first, so the new system is fully working before
the old one is touched, and anything still reading `specialty` at this point is by definition dead.

## Levers (directive 22)

**None.** Deleting the `specialty` block removes values rather than changing any. Re-pin the economy
approval gate in the same change, citing this sprint.

## Definition of done

1. No `specialty` in code, content, save schema or copy, except the six technique names living on as
   operations.
2. The economy `specialty` block is gone and the gate is re-pinned.
3. All ten missions are free of `specialtyGroups`.
4. The tutorial passes untouched.
5. The bible carries its fourth amendment.
6. `pnpm typecheck` clean; the full local gate green on the pre-push hook.

## The acceptance test for the whole arc

Run it here, at the end.

**Give two players with different scene standings the same auction sheet. If their shortlists
differ**, the Show Crowd shop bidding on the rust-free shell and the Touge shop on the tired chassis
with good bones, the system works.

## Exit

_To be completed at the end of the sprint._

# Specialty crediting analysis (Sprint 171, item 3)

**Status: investigation only. No behaviour changed.** Written for the maintainer to decide what, if
anything, to redesign; this document takes no side.

## What the player saw, and what actually produced it

The maintainer played the tutorial (bought the scripted Wagon R, replaced its scrap tyres and fixed
the buried lifter tick, delivered the "Four wheels" mission) and found the shop's **Body** specialty
at 15 of 120, with **Tyres**-adjacent (Wheels) and **Engine** both at 0.

**Pinned down concretely, not inferred:**

1. The tutorial mission is `four-wheels` (`packages/content/data/storyMissions.json:3-22`). Its
   authored fields are `"reputationReward": 15` and `"specialtyGroups": ["body"]`.
2. Delivering a story mission runs `resolveDeliverMission`
   (`packages/sim/src/missions.ts:179-276`), which at lines 218-222 calls:

   ```ts
   const { state: withSpecialty, deltas: specialtyGained } = applySpecialtyDelta(
     withReputation,
     mission.specialtyGroups,
     mission.reputationReward,
   )
   ```

   i.e. `applySpecialtyDelta(state, ["body"], 15)`.
3. `applySpecialtyDelta` (`packages/sim/src/serviceJobs.ts:917-931`) divides `totalDelta` evenly
   across `groups`. A one-element array gives the whole delta to that one group: `round(15 / 1) =
   15` into `body`, nothing anywhere else.
4. The Standing screen (`packages/game/src/screens/StandingScreen.vue:78-84`) renders that point
   total against `technique.thresholdPoints`, and every technique's threshold is 120
   (`packages/content/data/techniques.json`), which is the "15 of 120" reading.

No service job fired during this sequence. `radialOffersGated`
(`packages/sim/src/tutorial.ts:41-45`) keeps `generateDailyServiceJobOffers` from running at all
while `four-wheels` is undelivered (`advanceDay.ts:345-354` skips the call entirely), so the two
service-job call sites into `applySpecialtyDelta` could not have executed yet. Delivering
`four-wheels` is the only specialty-affecting event available to a tutorial player, and it is fully
accounted for by steps 1-4 above. The tutorial's own seeded faults are `tyres` (group `wheels`) and
`headValvetrain` (group `engine`) - see `packages/content/data/tutorialLot.json:12-19` and the
`lifter-tick` symptom - and neither appears anywhere in the 15-point credit. The credit is not
derived from the tutorial car's faults, the mission's requirement, or anything the player did; it is
a flat, independently-authored tag on the mission record.

## How crediting works today, caller by caller

`applySpecialtyDelta(state, groups, totalDelta)` is the only function that ever writes to
`state.specialty`. It has exactly three call sites in the whole codebase.

| # | Caller | File:line | `groups` argument | `totalDelta` argument |
| --- | --- | --- | --- | --- |
| 1 | Service job paid | `serviceJobs.ts:1032-1036` (inside `resolveServiceJob`) | `distinctTaskGroups(job.tasks, context)` | `reputationGained` (grade-scaled `baseReputation`) |
| 2 | Service job failed | `serviceJobs.ts:1072-1076` (inside `resolveServiceJob`) | `distinctTaskGroups(job.tasks, context)` | `-penalty` |
| 3 | Story mission delivered | `missions.ts:218-222` (inside `resolveDeliverMission`) | `mission.specialtyGroups` (authored content field, `StoryMission` schema) | `mission.reputationReward` |

Two different derivations feed the same function:

- **Callers 1 and 2** derive `groups` from `distinctTaskGroups(job.tasks, context)`
  (`serviceJobs.ts:890-900`), which maps each task through `taskGroup` (`serviceJobs.ts:1099-1101`:
  `context.partsTaxonomyById[task.requirement.carPartId]?.group`) and dedupes. This is the
  "job's declared tasks" mechanism the sprint doc names. The delta splits evenly across every
  DISTINCT group any task in the job's template addresses - not weighted by how many tasks are in
  each group, how much labour each task actually took, or whether the player did any work beyond
  what the job's tasks required.
- **Caller 3** does not derive anything. `mission.specialtyGroups` is a flat array authored directly
  on each `StoryMission` record (`packages/content/src/storyMission.ts:44-46`: "The specialty groups
  `reputationReward` splits across on delivery"), with no formula connecting it to the mission's own
  `requirements` list. This is a structurally different, weaker mechanism than callers 1/2: it isn't
  even wrong task-classification, there are no tasks to classify. It is a hand-picked tag.

## Why it produces the wrong answer

Stated as mechanism, not complaint:

- **Neither path reads the car.** Both derivations run off content records (a job template's task
  list, or a mission's authored tag array) that exist independent of the specific instance of car,
  parts, or labour the player put in. `state.specialty` is written exactly twice in the whole sim,
  and both writes are "a job/mission of type X resolved," never "a part of group Y was worked on."
- **For service jobs (callers 1/2), the task list is a reasonable but incomplete proxy.** A job's
  declared tasks do correspond to real required work (an accepted job is generated with
  `forceTasksOutstanding`, so its tasks were genuinely outstanding on that car). But the split is
  even-by-group regardless of effort: a job with one `tyres` task and three `headValvetrain`/
  `internals`/`camsTiming` tasks (one group each: wheels, engine, engine, engine - i.e. two distinct
  groups) still splits 50/50 between wheels and engine, not 25/75. And any repair the player does on
  that car beyond the job's own task list earns nothing, because `distinctTaskGroups` only ever
  looks at `job.tasks`, never at what changed on the car.
- **For story missions (caller 3), there is no proxy at all.** `specialtyGroups` is authored
  independently of `requirements`. `four-wheels`' requirement is `roadworthy`
  (`packages/sim/src/requirements.ts:231-246`: every one of the car's 29 parts, across all 6 groups,
  must be `worn` or better), the broadest possible requirement in the game, yet its tag is a single
  group, `body`, chosen by whoever authored the content row. Checking the other nine authored
  missions (`storyMissions.json`) shows the same pattern throughout: `wont-strand-her` and
  `the-fleet-spare` both gate on a bare `statThreshold: reliability` (a stat drawn from parts in 5 of
  the 6 groups per `parts-taxonomy.json`'s `statWeights.reliability` - every group but `interior`,
  whose two parts, `seats` and `dashGauges`, both weight reliability at 0) and both tag only
  `["engine"]`; `the-showroom-standard` requires `allPartsBandAtLeast` (again all 29 parts) plus a
  style threshold, and tags `["body", "interior"]` while omitting `wheels`, whose `rims` entry
  carries the single highest style weight in the taxonomy (3). Some tags are thematically apt
  (`low-and-loud`, a stance-culture mission, tags `["body", "wheels"]`); none are formula-derived.
  `four-wheels` is simply the first and most extreme case, because its requirement is the widest
  possible net and its tag is the narrowest possible catch.

## What reads specialty

The blast radius of any redesign - everything downstream of `state.specialty`, all in
`packages/sim/src/serviceJobs.ts` unless noted:

| Reader | What it does | Threshold source |
| --- | --- | --- |
| `topSpecialtyGroup` (:140-151) | Picks the shop's highest-scoring group, ties broken by declared `ComponentId` order | - |
| `shopTitle` / `titleGroupFor` (:158-171) | Names the shop after its top group once it clears a threshold | `economy.specialty.titleThresholdPoints` (80) |
| `unlockedTechniques` (:173-186) | Which of the 6 signature techniques are unlocked | `technique.thresholdPoints` (120, every technique, `techniques.json`) |
| `templateWeight` / `pickServiceJobTemplate` (:201-253) | Biases which service-job template gets offered towards the shop's strong groups; title group gets a further multiplier | `economy.specialty.biasFactor` (0.5), `softcapPoints` (100), `titleBiasMultiplier` (1.25) |
| `generateDailyServiceJobOffers` in-lane premium (:638-641) | Multiplies the payout margin and swaps the offer's flavour copy for `specialtyCopy` when a template stays wholly in the shop's top group | `economy.specialty.premiumThresholdPoints` (40), `inLanePremium` (1.15x) |
| `resolveAcceptServiceJob` technique gate (:740-749) | Refuses accepting a signature template unless its technique's group has cleared threshold | `technique.thresholdPoints` (120) |
| `gameStore.ts` `specialtyView` (:3405-3413) | Raw per-group points, dev-console-only readout | - |
| `gameStore.ts` `shopTitleName` (:3421-3424) | Player-facing title line shown on `GarageScreen.vue` and `StandingScreen.vue` | same as `shopTitle` above |
| `gameStore.ts` `standingView.specialties` (:3449-3464) | The Standing screen's per-discipline points + progress bar + technique unlock state (the exact surface the maintainer read "15 of 120" from) | `technique.thresholdPoints` (120) |
| `gameStore.ts` `unlockedTechniqueViews` (:3428-3433) | Dev-console-only technique list | `technique.thresholdPoints` (120) |

Progression bible law 4 ("no player-facing meter") is already only half-honoured: the raw six-way
point breakdown is dev-console-only, but `StandingScreen.vue` does show exact points and progress
bars per discipline as a deliberate, bible-sanctioned exception (its own comment cites "law 4
permits these exact numbers... on THIS view only"). Any redesign of how points are earned changes
what that one screen displays; it does not need to change what the other readers gate on, since they
all consume the same `Record<ComponentId, number>` shape regardless of how it got populated.

## Options

Not a recommendation; the maintainer decides. Each below keeps the same `Record<ComponentId,
number>` shape and the same set of readers above untouched - only how the number gets written
changes.

### A. Credit the groups of the parts actually worked

Derive `groups` (and, if wanted, a per-group weighted split rather than an even one) from the car's
own before/after part state at job/mission resolution - e.g. diff `job.car.parts` against its state
at acceptance, or walk whatever repair/replace actions actually touched the car, and credit the
groups those actions' `carPartId`s belong to (via the same `partsTaxonomyById` lookup `taskGroup`
already uses).

- **Takes:** a resolution-time diff mechanism that does not exist yet (nothing currently snapshots a
  job's car state at acceptance to diff against at completion); for missions, `specialtyGroups`
  becomes dead content that would need removing from ten authored records and the `StoryMission`
  schema.
- **Breaks:** the even-split simplicity `applySpecialtyDelta` currently has: an effort-weighted split
  needs a weighting rule (labour spent? band-steps climbed? task count?) that does not exist today
  and would need its own design. Also breaks the guarantee that specialty is always awarded on
  RESOLUTION (paid/failed/delivered) rather than incrementally - if credit follows individual repair
  actions, a job abandoned partway through would already have paid out some specialty, which is a
  design decision in its own right (directive 22/23 territory if it touches numbers).

### B. Credit on pipeline and repair actions rather than on job completion

Move the earn point from "a job/mission resolves" to "a repair/replace/pipeline stage completes" -
e.g. hook into whatever finalises a bench repair or a staged-work stage and credit that action's own
group directly, with no job or mission in the loop at all.

- **Takes:** identifying every action that currently has no specialty hook (bench repair, part
  replacement, staged-work stage completion - none of these call `applySpecialtyDelta` today, per
  the "what reads specialty" search above finding only two writers) and wiring each one; almost
  certainly a new economy lever (how many points per action) requiring maintainer sign-off per
  directive 22.
- **Breaks:** the current "specialty is a resolution-time reward, symmetric with reputation" shape -
  `reputationGained`/`penalty` and specialty are currently always applied together, from the same
  event, in the same function calls; decoupling them means specialty could now be earned on a job
  that later fails, or on player-owned-car repair work that never touches a customer job or mission
  at all (arguably desirable, since the finding above - no path currently credits work the player
  physically performed - is exactly this gap, but it is a scope increase, not a bug fix).

### C. Keep job-based crediting but fix the classification

Leave the "credit on job/mission resolution, split across groups" shape in place, but make the
groups it splits across an honest reflection of the actual required work rather than an authored
guess:

- For **service jobs**, this is close to already correct (task groups ARE genuinely-outstanding
  required work) - the main fix would be weighting the split by something other than flat per-group
  count if that is judged to matter.
- For **story missions**, replace the flat authored `specialtyGroups` with a derivation from
  `mission.requirements` (e.g. for a `statThreshold` requirement, credit the groups whose
  `statWeights` contribute to that stat; for `roadworthy`/`allPartsBandAtLeast`, credit all groups
  evenly, honestly reflecting that the requirement really does span the whole car).

- **Takes:** a `requirements` to `groups` derivation function per requirement kind (`roadworthy` and
  `allPartsBandAtLeast` -> all 6 groups; `statThreshold` -> every group with nonzero `statWeights` for
  that stat; `tasteMatch`/`lapTimeCeiling` have no clean per-group derivation and would need an
  authored fallback or a judgement call); removing or repurposing the `specialtyGroups` field.
- **Breaks:** the ten authored `specialtyGroups` arrays become either dead or reinterpreted; a
  `roadworthy` mission (the tutorial's own case) would now credit all 6 groups evenly rather than
  one, which changes the tutorial's own numbers and is itself a content/behaviour change requiring
  its own sign-off.

### Other options worth naming but not detailed here

- Drop mission-delivery specialty crediting entirely (missions pay reputation and yen; only service
  jobs, or only direct repair work, touch specialty) - the smallest change, but leaves missions with
  no specialty effect at all, which is itself a design stance.
- Author `specialtyGroups` more carefully by hand without changing the mechanism (fix `four-wheels`
  specifically, and audit the other nine) - a content-only fix that leaves the structural problem
  (crediting decoupled from actual work) exactly as-is for the next mission or template authored.

## What could not be established

- **Why `four-wheels` was tagged `["body"]` specifically.** There is no comment, commit message
  context, or authoring rule in the repo that explains the choice (nothing in `tutorialLot.json`,
  `storyMissions.json`, or their schema doc comments ties it to "body"). It reads as an arbitrary or
  placeholder single-group pick rather than a documented decision, but that is an inference from
  absence, not a confirmed fact - the original authoring intent, if any, is not recoverable from the
  codebase alone.
- **Whether an effort-weighted split (option A) is wanted at all**, and if so what "effort" should
  mean (labour points spent, band-steps climbed, yen spent, task count) - this is a design question
  with no existing precedent in the codebase to point to.
- **Whether bots ever exercise these paths in a way that would reveal a pacing effect** -
  bot-career simulation is directive-21-forbidden for the duration of this investigation, so no
  empirical read on how badly the mismatch compounds over a full career was taken; the analysis
  above is a structural/code read only.

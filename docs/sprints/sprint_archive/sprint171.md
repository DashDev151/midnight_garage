# Sprint 171: three faults the playtest found

**Source:** `docs/playtest-notes/playtest-notes-2026-08-03.md`.

Bugs only. No design change, no economy lever, no new feature. The larger items the same playtest
raised (the zone model, consumables as stock, the tutorial pass, labour rebalance, the world and its
rooms) are each their own sprint and none of them is started here.

## The three

### 1. The refit-assembly button is dead rather than disabled

**Confirmed.** `gameStore.ts`'s `assemblyRowsFor` computes

```ts
canRefit: onBench && !structurallyBlocked && !blockingGateGroup
```

**Labour is not in that gate.** So with the crane hired, every member fitted and nothing structurally
in the way, the button enables while the action cannot afford to run, and clicking it does nothing
at all. The maintainer reached the right diagnosis unaided, which is the tell: the screen never said
what the action costs or what was left.

`canRemove` on the line below has the same shape and the same hole.

**The fix is the gate AND the telling.** A button that silently does nothing is the worst outcome; a
disabled button that says why is the least. The paint stage built in Sprint 170 reads its disabled
state from the sim's own plan rather than re-deriving it, which is the pattern to follow here.

### 2. The stats radar

Four separate complaints, and they may not share a cause:

- **Power reads 50 but plots at the low end.** Either the plot normalises on a different scale from
  the label, or the axis maximum is not what the label's 0-to-100 implies.
- **The authenticity label is clipped.**
- **Handling reads 0.** Possibly correct with scrap tyres, possibly a floor being hit. Establish
  which before changing anything: a true 0 is a true 0.
- **Style reads 14.** Check against the car's authored `styleBase`. If they disagree, that is the
  bug; if they agree, the reading is right and the complaint is that the number is not explained.

`packages/game/src/components/StatRadar.vue` is the component.

### 3. Specialty credits the wrong group

**Confirmed as designed, which is the problem.** `applySpecialtyDelta` splits a job's points across
the groups of the JOB'S DECLARED TASKS, never across the work the player actually performed. So a
tutorial that had the player do tyre and engine work paid out 15 points of Body.

**This sprint diagnoses it and does not redesign it.** The maintainer's note is "the whole specialty
system needs to be looked at", which is a design pass, not a bug fix. What is wanted here is a
written account of where points come from today, every caller, and what it would take for points to
follow the spanner rather than the paperwork. **No behaviour change without a design decision.**

## Definition of done

1. The refit and remove buttons cannot be clicked when the action cannot run, and say why.
2. Every radar complaint is either fixed or explained with the number that proves it correct.
3. A written diagnosis of specialty crediting, with options, and no behaviour changed.
4. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Levers (directive 22)

**None.** No economy value, payout, price or sim formula moves. The labour rebalance the same
playtest asked for IS a lever change and is deliberately not in this sprint.

## Exit

**All three done.** Two bugs fixed, one diagnosis written, and one verdict overturned.

- [x] **1. The refit button.** `resolveRefitAssembly` is atomic: it refuses outright when labour is
      short, with no partial completion, so an ungated button produced a click that did nothing.
      `refitAssemblyLaborSlotsFor` was extracted in `assemblies.ts` and `resolveRefitAssembly` now
      calls it, so the quote and the charge cannot drift. The store gates on it and says **"Needs N
      labour, only M left today."** The button was also showing a flat zero cost rather than the real
      one. Every other action button was checked: `removePart` has the same shape but its behaviour
      is a recorded decision and was left alone; the rest cost zero labour in shipped content.
- [x] **2. The radar.** Four complaints, and the first verdict on them was wrong. See below.
- [x] **3. Specialty crediting**, diagnosed in `docs/design/systems/specialty-crediting-analysis.md`
      and NOT changed. The tutorial's 15 Body points are fully traced: the `four-wheels` mission
      carries `specialtyGroups: ["body"]`, a hand-authored tag with no link to its own requirements,
      and all ten missions are tagged the same loose way. **Nothing anywhere credits specialty for
      work the player performed.** The redesign that followed is PAUSED
      (`docs/design/systems/specialty-redesign.md`).

### The radar, and a verdict I relayed that was wrong

Three of the four complaints were investigated and returned as correct behaviour. Two of those
verdicts hold: **handling 0** is a true 0.14 rounding down with no clamp involved, and **style 14**
is `styleBase` 16 x 0.85 condition, exact. The **clipped authenticity label** was a real bug: the
old pad scaled with `size` while a label's rendered width does not, so the longest label nearest the
horizontal clipped first at the size the game actually renders. Fixed with a per-axis clearance
calculation.

**"Power reads 50 but plots low" was reported as correct and it was not.** The investigation
established that power's label and plot agreed with each other; it never asked whether power agreed
with the other four axes. It did not, in two separate ways:

- **The label printed raw PS beside four 0-100 stats.** A player reading 50, 59, 82 has no way to
  know one of those is not out of 100.
- **The plot's scale was a hardcoded 560 in the game package**, `RADAR_POWER_REFERENCE_PS`, used by
  the radar alone and agreeing with nothing else.

**The first fix was wrong too, and the maintainer caught it.** Routing the radar through the sim's
`normalizedPowerScore` made one normalisation out of two, but anchored the chart to
`powerNormalizationCeiling` (300), which is the BUYER model's taste term: the PS past which a buyer
stops caring. Nine roster cars exceed it stock and any built engine clears it twice, so the spoke
pegged constantly and a 750 PS race Supra plotted identically to a stock one.

**A chart and a buyer want opposite things from a ceiling**, so they get separate ones.
`statFormulas.radarPowerCeilingPs` is a new display scale at **800** (maintainer-approved, and
re-pinned in the economy gate in the same change), sitting above the roster's fastest stock car with
room for a built motor:

| | | |
| --- | ---: | ---: |
| Wagon R stock | 50 PS | 6 |
| Civic SiR | 170 PS | 21 |
| Supra RZ | 324 PS | 41 |
| LFA | 560 PS | 70 |
| race 2JZ build | 750 PS | 94 |

The game-side constant is deleted, and the label now reads the same 0-100 value it plots.

**The buyer-model fault the maintainer spotted while reading this is NOT fixed here** and is carried
in `TODO.md` as a deferred bug fix. Against the 300 ceiling, the most power-hungry archetype
(`racer`, target 0.75) is fully satisfied by **225 PS**, so nothing above that is worth anything to
any buyer and the entire power ladder terminates in a customer who stopped caring. **The fix is not
a bigger constant**, which only moves the wall: buyer expectation should scale with what the player
can build, so customer wants grow as the shop does.

### Checks

`pnpm typecheck` clean across content, sim and game. `radar.test.ts`, `CarDetailScreen.test.ts`,
`gameStore.garage.test.ts` and `assemblies.test.ts` all pass. No economy or sim value moved.

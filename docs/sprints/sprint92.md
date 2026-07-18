# Sprint 92 - Uniform tool access (rent or own, every group)

The first of two tooling sprints implementing `docs/design/tooling-system.md` (read it
first; it is the source of truth). This sprint delivers Axis 1 (ACCESS) and makes rental
legible. No band-model change; that is Sprint 93.

## Reuse analysis (directive 16)

**New mechanisms:**

- Rental fee keys + gates for the three groups that lack them (suspension, body, interior).
- Three new signature-op gates (Axis 1 table in the design note).
- Rental cost surfaced on the Upgrades screen.

**Existing mechanisms to reuse (the design note's reuse list):**

- The 6 tool lines, `toolTiers` state, the classifieds purchase pipeline: untouched.
- `machineAssistFeeYen` / `assemblyMachineAssistFeeYen` and the ledger-posting path: the fee
  mechanism is extended to 3 more groups, not reinvented.
- `removeMachineGateGroup` (engine/drivetrain) is generalised into a per-group
  signature-op predicate, keeping the existing two as the first two rows.
- The Upgrades screen tool wall and `toolTierInfo` view.
- The coherence fee probe pattern in `storyMissionProbes.test.ts`.

## Decisions

1. **Extend the fee content to all six groups.** `economy.machineShopAssist.feeYenByGroup`
   gains `suspension`, `body`, `interior` (schema widened from the current 3-key object to
   all 6 `ComponentId`s). Proposed fees, each pinned below its tier-2 machine amortised over
   `probeAmortisationOps` (=40): **suspension ¥5,000** (lift ¥250k), **body ¥14,000**
   (welder/panel ¥700k), **interior ¥7,000** (bench ¥350k). Engine/drivetrain/wheels
   unchanged (¥15k / ¥18k / ¥3k). Exact figures are tunable; the probe (decision 5) pins the
   amortisation invariant for all six.
2. **Generalise the signature-op gate.** Replace `removeMachineGateGroup`'s hard-coded
   engine/drivetrain buried-part rule with a single per-group "signature op needs tier-2"
   predicate driven by content (a `signatureOp` descriptor per group, or reuse the existing
   depth/assembly structure). The three existing gates (engine pull, gearbox pull, tyre fit)
   keep byte-identical behaviour; the three new gates fire on:
   - suspension: fitting/replacing `dampers` or `springs` (spring-compression work);
   - body: repair/replace of `panels` or `underbody` (weld/panel work);
   - interior: repair/replace of `seats` or `dashGauges` (retrim).
   Each is satisfied by owning that group's tier-2 OR paying the group's fee, posted to the
   ledger. Light bolt-on work in these groups stays tier-1, no fee.
3. **The one hard wall stays hard.** `naToTurboConversionBlocked` (engine tier-3, NA→turbo)
   remains a genuine refusal, not rentable: it is the "bolt-on vs built" line in the
   progression bible, and Sprint 90 already made it non-blocking for roadworthy. Unchanged.
4. **Rental made legible on the Upgrades screen.** The tool-wall tier-2 rung for every group
   shows what its rental fee is today and that owning the machine removes it (e.g. "Renting
   this out costs {fee}/job; own it to stop paying"). Wording drafted by the orchestrator at
   implementation. This closes the "invisible until it disappears" gap.
5. **Coherence probe covers all six.** Extend the existing fee-amortisation probe loop from
   `['engine','drivetrain']` to all six groups (it currently silently skips wheels too);
   each fee `> 0` and `fee x probeAmortisationOps <= tier-2 price`. Add a probe that the
   three new signature ops charge the fee at tier-1 and `0` at tier-2 (mirroring the
   existing engine/drivetrain assertions).
6. **No band change, no save change.** Repair still reaches any band at any tier this sprint
   (Sprint 93 changes that). Fees are transactional; no new persisted state. No Dexie bump.

## Definition of done

- [ ] All six groups have a rental fee; the schema and content carry six keys; the
      amortisation probe covers all six.
- [ ] The three new signature-op gates fire (own-or-fee) on their heavy ops; light bolt-on
      work in those groups stays free; the three existing gates are unchanged.
- [ ] Fees post to the car/job ledger; budget caps and job billing see them.
- [ ] The Upgrades screen shows each group's rental cost and the own-to-stop-paying framing.
- [ ] `naToTurboConversionBlocked` still a hard refusal.
- [ ] Three package typechecks clean; narrowest tests once; pre-push gate is the evidence.

## Task breakdown

**Claude-implementable:** all; the Upgrades-screen rental copy is drafted by the
orchestrator. **User-only:** eyeball the Upgrades screen's new rental framing.

## Exit

(Filled at sprint close.)

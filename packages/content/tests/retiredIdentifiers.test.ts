import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const PACKAGES_ROOT = join(REPO_ROOT, 'packages')
const PACKAGE_NAMES = ['content', 'game', 'sim'] as const

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'tests'])
const SCAN_EXTENSIONS = ['.ts', '.vue']
/** Colocated test files (the game package's `*.garage.test.ts` style) live
 * under `src/` without a `tests/` directory to skip - excluded by name
 * instead, matching the same "no test fixtures" scope a `tests/` directory
 * skip would otherwise give for free. */
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|vue)$/

interface RetiredIdentifier {
  /** The dotted-path or bare identifier text. Matched at word boundaries (a
   * literal `.` in this text is escaped, never treated as regex "any
   * character"), so `.retention` cannot match inside `partsRetention`. */
  identifier: string
  /** The sprint that retired it. */
  retiredInSprint: number
  /** One line: what replaced it and why the old name must not come back. */
  reason: string
  /** Package names (from `PACKAGE_NAMES`) this identifier is banned under.
   * Defaults to all three - narrow this only when the retirement is
   * genuinely package-scoped, i.e. one package still has a legitimate reason
   * to name the thing (a dev-only screen displaying a raw field, say) while
   * another must never read it. */
  scopedToPackages?: ReadonlyArray<(typeof PACKAGE_NAMES)[number]>
}

/**
 * Every identifier this codebase has deliberately retired. A revived
 * reference - a stale merge, a copy-pasted snippet, a doc example turned
 * real code - fails this fast, narrow test instead of waiting for
 * `pnpm typecheck` during a push to catch it, the exact gap
 * `PartsMarketScreen.vue`'s stale `statModifiers.reliability` read sat in
 * for two sprints after that field left the schema. Each entry carries the
 * sprint that retired it and the one-line reason, the same ledger-comment
 * shape `economyApprovalGate.test.ts` uses for pinned values.
 *
 * Its value over typecheck is reach and cost, not power: it catches a
 * retired name inside a string literal, a `Record<string, X>` index or a
 * comment, none of which the compiler can see, and it runs as one narrow
 * file rather than a whole-program compile.
 */
const RETIRED_IDENTIFIERS: readonly RetiredIdentifier[] = [
  {
    identifier: 'statModifiers.power',
    retiredInSprint: 135,
    reason:
      'Replaced by statModifiers.powerFraction (proportional, per-engine-character power) - a flat PS delta could not tell an NA Beat from a twin-turbo Supra apart.',
  },
  {
    identifier: 'statModifiers.reliability',
    retiredInSprint: 136,
    reason:
      'A part does not add reliability outright: reliability is condition plus the support-ratio coherence factor (support.ts), never a sum of per-part deltas.',
  },
  {
    identifier: 'statModifiers.handling',
    retiredInSprint: 140,
    reason:
      'A flat per-part handling delta sitting alongside physicalModifiers.grip, which already moves the quantity the handling readout is built from - the second path PhysicalModifierSchema bans by name for power and downforce, charging one suspension upgrade twice. Every one of the 148 SKUs that carried it saturated the stat: a full race chassis build read exactly 100 handling on all 26 cars. The handling STAT is untouched and so is the taxonomy statWeights.handling column: condition and grip both still reach it through computeDerivedStats.',
  },
  {
    identifier: 'reliabilityCap',
    retiredInSprint: 136,
    reason:
      'Replaced by CarModel.spec.reliabilityBase (a per-car value) - the flat 70 ceiling had no per-car meaning.',
  },
  {
    identifier: 'priceSensitivity',
    retiredInSprint: 143,
    reason:
      'Authored, schema-validated and test-asserted with zero readers anywhere in gameplay; Sprint 146 re-authors the buyer schema from a clean slate rather than carrying a dead lever forward unexamined.',
  },
  {
    identifier: 'partsRetention',
    retiredInSprint: 144,
    reason:
      'A flat 0.55 for every build in the game, which is why modifying a car to sell it lost money whatever you did. Replaced by retentionFor (marketValue.ts), a curve between valuation.retentionFloor and valuation.retentionCeiling driven by the coherence factor of the build - deleted rather than left inert, per this sprint ruling that a lever reading live and doing nothing is worse than either extreme.',
  },
  {
    identifier: 'styleCap',
    retiredInSprint: 145,
    reason:
      'A flat 20 for every car regardless of what it was, so a Toyota 2000GT and a Nissan S-Cargo scored identically on style. Replaced by CarModel.spec.styleBase (a per-car value) - the flat cap had no per-car meaning.',
  },
  {
    identifier: 'buyer.statWeights',
    retiredInSprint: 146,
    reason:
      'A weighted MEAN of five deliberately anti-correlated stats, so no real car could score highly and the taste band sat near the middle by construction. Replaced by Buyer.statTargets (target/upper/importance per stat, normalizedTasteScore in valuation.ts) - a match, where clearing a target earns full marks and an upper bound can actively cost them. Bare "statWeights" is not banned: CarPartTaxonomyEntryContentSchema.statWeights (parts-taxonomy.json condition weighting) is an unrelated, still-live field of the same name.',
  },
  {
    identifier: 'sinceDay',
    retiredInSprint: 147,
    reason:
      'ForSaleEntry.sinceDay was the absolute day clock the design rejects: it double-charges a specialist car that is already slow to sell because offers arrive rarely. Replaced by offersSeen, the normalised clock (sale-value-system.md S4) that both the staleness and offer-quality curves read - a car nobody has come to look at has not gone stale. Its one reader, holdingDays in bots/sellingHelpers.ts, is retired in the same change.',
  },
  {
    identifier: 'offerSpread',
    retiredInSprint: 147,
    reason:
      'A flat uniform band applied identically whether a car was listed this morning or two months ago, so time was free and the correct play was to skip days until a good number appeared. Replaced by the quality draw (economy.liquidity.qualityFresh/qualityFloor/qualityHalfLifeOffers/qualitySpread, drawQualityFraction in selling.ts) - a seeded Normal draw around a mean that slides down as offersSeen rises.',
  },
  {
    identifier: 'auctionDayOfWeek',
    retiredInSprint: 150,
    reason:
      'One global auction day for every room, so a player who had earned access to four rooms got exactly one buying day a week - backwards, since earning access should give you more to do, not less. It also sent a brand-new player to a shuttered auction house on day 1, breaking the tutorial. Replaced by economy.auction.cadenceByTier (openDaysOfWeek + weeksBetween per room) and calendar.ts isAuctionTierOpen: cadence is a property of the VENUE, not the calendar. Matched bare rather than as calendar.auctionDayOfWeek so any dotted path to it trips too.',
  },
  {
    identifier: 'auctionRoom.reserveFraction',
    retiredInSprint: 150,
    reason:
      'A second, disagreeing seller floor: 0.55 here against AUCTION_RESERVE_PRICE_FRACTION 0.6, over the same guide value, so the live room opened below the reserve its own auction card advertised. Maintainer ruling 2026-07-31, "set the reserve to 0.6 everywhere": the fraction is authored once at the top level and folded into the room tuning by auctionRoom.ts roomConfigFrom. Bare reserveFraction is deliberately NOT banned - RoomConfig still carries the field, it just no longer authors it.',
  },
  {
    identifier: 'authenticityPercent',
    retiredInSprint: 151,
    reason:
      'CarInstance.authenticityPercent was a stored rng.int(60, 95) roll no player action could ever move, which contradicts the maintainer definition that an all-stock, all-mint car IS perfectly authentic. Replaced by the derived authenticityPercentOf (sim/derivedStats.ts): stockness over the taxonomy authenticity weights, times the same weights condition factor. The replacement name is deliberately not caught by this entry, since the word boundary after "Percent" fails against "PercentOf".',
  },
  {
    identifier: 'statModifiers.authenticity',
    retiredInSprint: 151,
    reason:
      'A per-part authenticity delta that every one of the 472 shipped SKUs authored as exactly 0, so the whole mechanism was inert. A part grade already says whether it is the original, which is the entire originality signal stocknessOf reads; a second per-part number was a duplicate answer to one question.',
  },
  {
    identifier: 'genuinePeriod',
    retiredInSprint: 151,
    reason:
      'A PartInstance/PartBaseline flag no shipped content ever set true (six construction sites hardcoded false), gating a valuation multiplier and half of the dead authenticity delta above. RULED 2026-07-31 redundant and re-addable later if a genuine-versus-repro distinction earns its place. Bare rather than dotted so any path to it trips; genuinePeriodMultiplier is a separate entry because the word boundary does not match inside it.',
  },
  {
    identifier: 'genuinePeriodMultiplier',
    retiredInSprint: 151,
    reason:
      'valuation.genuinePeriodMultiplier (1.25) multiplied an installed part contribution when its instance was genuine period. Nothing ever was, so it multiplied by 1.0 on every part of every car in the game; it dies with the flag it read.',
  },
  {
    identifier: 'minWorkBillFractionByTier',
    retiredInSprint: 153,
    reason:
      'A per-tier fraction of book value that generation broke parts until the repair bill reached, with no limit: it authored 62 to 89 per cent of the damage on every car in the game, and hit cheap cars hardest because their parts are cheap so it had to break more of them. Replaced by partsGeneration.damageGrades - a grade rolled per lot and spent in BAND STEPS, so the bill falls out of the parts own prices instead of driving them.',
  },
  {
    identifier: 'enforceMinWorkBill',
    retiredInSprint: 153,
    reason:
      'The loop that chased the fraction above. Replaced by spendDamageBudget (sim/auctions.ts): same stepping machinery, same Law 2 ceiling guard, same never-to-scrap candidate rule, but the stop condition is a spent budget rather than a yen target.',
  },
  {
    identifier: 'minWorkTopUpCeilingBinds',
    retiredInSprint: 153,
    reason:
      'Asked whether the Law 2 ceiling was what stopped the retired floor short. The budget has no shortfall to explain away: it spends what it rolled and stops, so the question no longer has a caller.',
  },
  {
    identifier: 'upkeepTierWeights',
    retiredInSprint: 154,
    reason:
      'A second, independent roll of "how was this car treated", sitting beside the damage grade roll that asks the same question - so a car someone had given up on could carry a cherished provenance blurb. The upkeep tier is now DERIVED from the rolled history (partsGeneration.damageGrades.upkeepTierByGrade); one cause, several effects. The three upkeep EFFECT tables (upkeepBaselineOffset, upkeepJitterRange, upkeepMissingMultiplier) are untouched and still live.',
  },
  {
    identifier: 'rollUpkeepTier',
    retiredInSprint: 154,
    reason:
      'The roller for the weights above. Nothing replaced it: upkeepTierByGrade is a lookup on a value that has already been rolled, not a second draw.',
  },
  {
    identifier: 'damageGrades.weights',
    retiredInSprint: 154,
    reason:
      'One flat 45/35/15/5 applied to a Toyota 2000GT and a Honda Acty alike, so nothing about what a car IS changed how likely it was to have been looked after. Replaced by partsGeneration.damageGrades.careProfiles plus careProfileByCulture: culture picks a profile, tier shifts it one step, and the roster-wide mix is what the 94 authored cultures add up to rather than a number anyone sets. Matched as a dotted path because bare "weights" is a live local in rollDamageGrade and in several unrelated tables.',
  },
  {
    identifier: 'kei-specialist',
    retiredInSprint: 158,
    reason:
      'Renamed to hobbyist, no value moved. The archetype was never kei-only: its tierPreferences are entry 1.0 AND everyday 0.6, so it turns up for a Corolla as readily as for a Cappuccino, and its want-line claimed otherwise. Every other archetype is a role-noun (collector, tuner, stancer, racer, first-timer) and this one named a market segment instead.',
  },
  {
    identifier: 'WEEKLY_RENT_YEN',
    retiredInSprint: 148,
    reason:
      'A flat 20,000 regardless of how much yard the player owned, so a bought bay was free to hold forever and capacity was a pure ratchet. Replaced by economy.rent (baseWeeklyYen plus a per-kind perBayWeeklyYen rate) and computeWeeklyRentYen (finances.ts), which sums base plus every owned bay of every kind - sized so day 1 is unchanged at exactly 20,000.',
  },
  {
    identifier: 'first-timer',
    retiredInSprint: 176,
    reason:
      'Renamed to daily-drivers, no value moved. "First-timer" read as condescending to somebody who just wants a good cheap car; the archetype is a budget-commuter buyer, not a novice.',
  },
  {
    identifier: 'stancer',
    retiredInSprint: 176,
    reason:
      'Renamed to show-crowd, no value moved. Broad English rather than one style tribe: shakotan, kaido racer, VIP, grachan and bosozoku styling all live in flavour copy, never in system vocabulary.',
  },
  {
    identifier: 'saleReputationDeltaFor',
    retiredInSprint: 184,
    reason:
      "The lemon/clean/concours predicate: reputation read the car's condition bands at the moment of sale and called that craftsmanship. Replaced by saleOutcomeFor (sim/valuation.ts), which reads whether the person who bought the car got what they came for and nothing else. Selling a rough show car to the Show Crowd is honest work and pays; selling the same car to a Daily Driver pays nothing. Its whole module (carCondition.ts) went with it.",
  },
  {
    identifier: 'saleQualityFor',
    retiredInSprint: 184,
    reason:
      "Derived which of the condition predicate's four outcomes had fired, for the day-report copy. The outcome is now decided directly by saleOutcomeFor and logged as itself, so nothing has to reverse-engineer a verdict out of a point value.",
  },
  {
    identifier: 'cleanSaleMinBand',
    retiredInSprint: 184,
    reason:
      'The per-part band floor a "clean" sale demanded. Reputation no longer reads a condition band at all: what the buyer wanted is the whole question.',
  },
  {
    identifier: 'cleanSaleBonus',
    retiredInSprint: 184,
    reason:
      'A clean sale paid 2 while a tier-4 service job with a race part paid up to 75, so the ladder to legend was a service business that happened to gate a car business. Replaced by reputation.satisfiedSaleBonus (15), which clears the top of the tier-2 service band.',
  },
  {
    identifier: 'concoursSaleMinAuthenticityPercent',
    retiredInSprint: 184,
    reason:
      'An 85-of-100 authenticity bar no built car could ever reach - an aftermarket block alone costs 18 of those points, a kit and wheels together 17 - so a tuner, show or racing shop was structurally capped below the top rate however good its work was.',
  },
  {
    identifier: 'concoursSaleBonus',
    retiredInSprint: 184,
    reason:
      "The game's only +4, gated behind the unreachable authenticity bar above. Replaced by reputation.delightedSaleBonus (30, every stat the buyer cares about cleared), which every play style can reach.",
  },
  {
    identifier: 'lemonSalePenalty',
    retiredInSprint: 184,
    reason:
      'Reputation only ever rises now (progression bible, fifth amendment): a disappointed buyer pays nothing rather than taking anything away. Strengthens law 6 rather than bending it.',
  },
  {
    identifier: 'lemonMaxAverageBandFactor',
    retiredInSprint: 184,
    reason:
      'The cost-weighted band-factor bar that triggered the penalty above. It dies with the penalty and with the whole idea that a condition figure says anything about the shop that sold the car.',
  },
  {
    identifier: 'matchedSaleRepBonus',
    retiredInSprint: 184,
    reason:
      'A flat +1 stacked on top of a condition verdict. Absorbed rather than deleted: reading the buyer IS the reputation event now, so a separate bonus for having done it would be the same fact paid twice. The MATCHED test itself (isTasteMatched) is untouched and still governs the matchedOnly channel gate and the scene-standing delivery credit.',
  },
  {
    identifier: 'SERVICE_JOB_FAILURE_REP_MULTIPLIER',
    retiredInSprint: 184,
    reason:
      'Docked twice the job base for handing a job back unfinished or overdue. Retired by the monotonic ruling: a failed job now earns nothing rather than costing anything, and the forfeited payout plus the sunk repair and parts bills are the whole of what a failure costs.',
  },
  {
    identifier: 'reputationForFailure',
    retiredInSprint: 184,
    reason:
      'The helper that applied the multiplier above, and the ServiceJobView.failureReputationPenalty and service-job-failed reputationLost fields that surfaced it. Nothing replaced them: there is no number to show for a cost that no longer exists.',
  },
  {
    identifier: 'hobbyist',
    retiredInSprint: 176,
    reason:
      'Deleted outright, not renamed or demoted to an unaffiliated pool - the second archetype this codebase has retired for naming a market segment rather than a role (see the kei-specialist entry above, which named hobbyist as its own replacement). Its demand is inherited by daily-drivers and the broadened tuner; the buyerPoolWeights it held (1.4 in the free ads paper, 0.8 at the weekend meet) were re-authored across all four weighted channels rather than left as a gap.',
  },
  {
    identifier: 'machineShopAssist',
    retiredInSprint: 231,
    reason:
      "The whole block, superseded by economy.toolHire: a group's bench is hired for the DAY at one fee (toolHire.feeYenByGroup) rather than assisted per operation, and its three members had no production reader left. Its fees disagreed with the live ones for five of six groups (wheels 3,000 against 6,250, body 6,500 against 10,000), so the two surviving readers were tests passing on a stale table - the exact silent-drift case this ledger exists for.",
  },
  {
    identifier: 'machinelessLaborMultiplier',
    retiredInSprint: 231,
    reason:
      'Replaced by economy.toolHire.slogMultiplier, which carries the same 3: what it costs to do a machine-gated step by hand is a property of the hire desk, not of a second block beside it. Both being 3 is why the duplicate survived unnoticed since 226.',
  },
  {
    identifier: 'probeAmortisationOps',
    retiredInSprint: 231,
    reason:
      'A member of the block above with no reader anywhere, ever - not in sim, not in the game, not in a probe. Its intent lives on as toolHire.amortisationDays, which storyMissionProbes.test.ts actually checks against the live tool-line prices.',
  },
  {
    identifier: 'machineListings',
    retiredInSprint: 231,
    reason:
      'The tuning block behind the used-machinery classifieds, left inert when that feature was removed from advanceDay and GameState: a schema key and four authored numbers nothing had read since. Nothing replaced it - a tool tier that clears reputation is purchasable outright again.',
  },
  {
    identifier: 'resolveReconditionLabor',
    retiredInSprint: 231,
    reason:
      'The in-inventory reconditioning path: a loose part climbed condition bands on a workbench under its own resolver, a second implementation of repair beside the on-car one. Replaced by resolveRepairStep (sim/repairJobs.ts), which works a loose part and an installed slot through the same three-job recipe ladder. The private helpers that only it called - planReconditionPart, reconditionJobIdFor, completeReconditionJob, updateLoosePart, ReconditionPlan - go with it; repairJobIdFor is the surviving id minter.',
  },
  {
    identifier: 'reconditionQuote',
    retiredInSprint: 231,
    reason:
      'Priced one bench climb before it was committed. Replaced by repairJobCards (sim/repairJobs.ts), which quotes all three jobs at once so the choice is between ladders rather than between band targets. The ReconditionQuote interface goes with it.',
  },
  {
    identifier: 'reconditionGateReason',
    retiredInSprint: 231,
    reason:
      'Answered why a bench climb was refused, in its own vocabulary. Replaced by RepairJobCardRefusal and RepairStepRefusal (sim/repairJobs.ts): the card says why a job cannot be offered and the step says why it cannot be taken, which are different questions the one gate used to blur.',
  },
  {
    identifier: 'findLoosePart',
    retiredInSprint: 231,
    reason:
      'Searched partInventory and every assembly container for one loose part id, so the reconditioning path could write a band back into whichever held it. Nothing needs the search now: benchHoldingPart (sim/repairJobs.ts) answers where a part is laid out, and the repair engine writes through the container it already holds.',
  },
  {
    identifier: 'reconditionPart',
    retiredInSprint: 231,
    reason:
      'The store action and the session-event variant of the same name, both reaching the retired resolver above through a workbench panel nothing mounted. The live vocabulary is placeOnBench / repairStep / takeOffBench, which is what the replay path records and what careerReplay.ts dispatches on.',
  },
  {
    identifier: 'reconditionQuoteFor',
    retiredInSprint: 231,
    reason:
      "The store's wrapper over reconditionQuote. Its replacement is the job-card list the bench screen already renders, so no separate quote lookup exists to call.",
  },
  {
    identifier: 'nextReconditionStep',
    retiredInSprint: 231,
    reason:
      'Told the workbench which band a loose part would climb to next. A job is now the unit the player commissions, not a band step: defaultRepairJobKind (game/utils/repairJobLabels.ts) picks which of the three the bench offers first.',
  },
  {
    identifier: 'benchWorkRefusal',
    retiredInSprint: 231,
    reason:
      "The workbench panel's copy for a refused bench climb. The bench screen reads the refusal off the job card itself, so the reason is written once beside the gate that produces it rather than restated in a panel.",
  },
  {
    identifier: 'benchIdleReason',
    retiredInSprint: 231,
    reason:
      'Explained an empty workbench (nothing on it, nothing loose to put on it). Its whole module, screens/workshopFloor.ts, went with the panel that was its only caller; the bench screen states its own empty case.',
  },
  {
    identifier: 'repairCeilingCaption',
    retiredInSprint: 231,
    reason:
      'Told the player their tool tier capped a repair short of mint, a sentence the three-job model states structurally instead: restore is the job that reaches mint and it is offered only where the covering shop is owned, so the ceiling is visible as a job you cannot commission rather than as a caption under one you can. The private repairCeilingSentence both this and benchRepairCeilingCaption were built from went with them.',
  },
  {
    identifier: 'benchRepairCeilingCaption',
    retiredInSprint: 231,
    reason:
      'The workbench half of the caption above, for a loose part rather than an installed slot. Retired for the same reason and replaced by the same thing: the job list itself.',
  },
  {
    identifier: 'repairMachineNoteFor',
    retiredInSprint: 231,
    reason:
      "A note on what a repair's machine gate would cost, left with no caller once the band pipeline stopped quoting repairs. Its two siblings on the same pattern, removeMachineNoteFor and installMachineNoteFor, are untouched and still render on the car detail screen: the gate itself is alive, only the repair-shaped note is gone.",
  },
  {
    identifier: 'nextPartStepRange',
    retiredInSprint: 231,
    reason:
      'Reported the band range one repair step would move a part through, for a car-detail row that no longer exists. Nothing replaced it: a job card names the band the finished job leaves the part at (targetBandFor, sim/repairJobs.ts), which is the figure the screen actually shows.',
  },
  {
    identifier: 'repairRevealFor',
    retiredInSprint: 231,
    reason:
      "The reveal-then-confirm gate that stopped an on-car repair charging for a band the player had never been shown. The job card replaces it properly rather than dropping the protection: repairJobCards prices an unverified slot off knowledgeViewOf's masked guess, so a card never quotes a figure that would give away a condition the player has not paid to find out (sprint231.md decision D-R2).",
  },
]

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectFiles(fullPath, out)
    } else if (
      SCAN_EXTENSIONS.some((ext) => fullPath.endsWith(ext)) &&
      !TEST_FILE_PATTERN.test(entry)
    ) {
      out.push(fullPath)
    }
  }
  return out
}

const FILES_BY_PACKAGE: Readonly<Record<(typeof PACKAGE_NAMES)[number], string[]>> =
  Object.fromEntries(
    PACKAGE_NAMES.map((name) => [name, collectFiles(join(PACKAGES_ROOT, name, 'src'))]),
  ) as Record<(typeof PACKAGE_NAMES)[number], string[]>

function findOffenses(entry: RetiredIdentifier): string[] {
  const pattern = new RegExp(`\\b${escapeRegExp(entry.identifier)}\\b`)
  const packages = entry.scopedToPackages ?? PACKAGE_NAMES
  const offenses: string[] = []
  for (const pkg of packages) {
    for (const filePath of FILES_BY_PACKAGE[pkg]) {
      const lines = readFileSync(filePath, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (pattern.test(line)) {
          offenses.push(`${relative(REPO_ROOT, filePath)}:${i + 1}`)
        }
      })
    }
  }
  return offenses
}

describe('the retired-identifier ledger', () => {
  it.each(RETIRED_IDENTIFIERS.map((entry) => [entry.identifier, entry] as const))(
    'no source file reads or names %s',
    (_identifier, entry) => {
      const offenses = findOffenses(entry)
      expect(
        offenses,
        `${entry.identifier} (retired sprint ${entry.retiredInSprint}: ${entry.reason}) found at:\n${offenses.join('\n')}`,
      ).toEqual([])
    },
  )

  it('a dotted path is matched at a word boundary, not as a substring of a longer name', () => {
    const pattern = new RegExp(`\\b${escapeRegExp('statModifiers.power')}\\b`)
    expect(pattern.test('part.statModifiers.powerFraction.forced')).toBe(false)
    expect(pattern.test('return part.statModifiers.power')).toBe(true)
  })
})

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
   * character"), so `.aspiration` cannot match inside `carAspiration`. */
  identifier: string
  /** The sprint that retired it. */
  retiredInSprint: number
  /** One line: what replaced it and why the old name must not come back. */
  reason: string
  /** Package names (from `PACKAGE_NAMES`) this identifier is banned under.
   * Defaults to all three - narrow this only when the retirement is
   * genuinely package-scoped, as `spec.aspiration` is (a dev-only screen in
   * `packages/game` legitimately still reads the raw spec field for
   * display; only sim logic may never read it). */
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
    identifier: 'spec.aspiration',
    retiredInSprint: 135,
    reason:
      'A duplicate representation of induction with nothing guarding that it agrees with tags; hasForcedInduction is the one source of truth sim code may read. Folded in from engineCharacter.test.ts rather than left as a second, hand-rolled guard.',
    scopedToPackages: ['sim'],
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
    identifier: 'WEEKLY_RENT_YEN',
    retiredInSprint: 148,
    reason:
      'A flat 20,000 regardless of how much yard the player owned, so a bought bay was free to hold forever and capacity was a pure ratchet. Replaced by economy.rent (baseWeeklyYen plus a per-kind perBayWeeklyYen rate) and computeWeeklyRentYen (finances.ts), which sums base plus every owned bay of every kind - sized so day 1 is unchanged at exactly 20,000.',
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

  it('.aspiration is matched at a word boundary, not as a substring of carAspiration', () => {
    const pattern = new RegExp(`\\b${escapeRegExp('spec.aspiration')}\\b`)
    expect(pattern.test('const carAspiration = 1')).toBe(false)
    expect(pattern.test('return spec.aspiration')).toBe(true)
  })
})

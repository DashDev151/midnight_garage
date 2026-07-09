import type {
  AuctionLot,
  AuctionTier,
  CarInstance,
  CarModel,
  DayLogEntry,
  GameState,
  HiddenIssue,
  RarityTier,
  Zone,
} from '@midnight-garage/content'
import { AUCTION_TRAVEL_FEE_YEN } from './constants'
import type { Rng } from './rng'

const COLOR_POOL = ['White', 'Black', 'Silver', 'Gunmetal', 'Red', 'Blue'] as const

const PROVENANCE_POOL = [
  'one-owner, garage kept',
  'dealer trade-in, service history unknown',
  'estate sale, low mileage claimed',
  'daily driver, honest wear',
] as const

/**
 * GDD 4.5: Gaisha is sourced only via the (unbuilt) Import Broker, "no
 * auction luck" — it never appears in a regular auction catalog. Legend
 * appears only at the rep-gated Collector Network (GDD 9.2: rare, mostly
 * story leads, occasionally an auction).
 */
export function auctionTierForRarity(tier: RarityTier): AuctionTier | null {
  switch (tier) {
    case 'shitbox':
    case 'common':
      return 'local-yard'
    case 'uncommon':
      return 'regional'
    case 'rare':
      return 'premium'
    case 'legend':
      return 'collector-network'
    case 'gaisha':
      return null
  }
}

export function groupHiddenIssuesByZone(
  issues: readonly HiddenIssue[],
): Readonly<Record<Zone, readonly HiddenIssue[]>> {
  const grouped: Record<Zone, HiddenIssue[]> = {
    engine: [],
    drivetrain: [],
    suspension: [],
    body: [],
    interior: [],
  }
  for (const issue of issues) {
    grouped[issue.zone].push(issue)
  }
  return grouped
}

/**
 * Rolls a fresh, not-yet-owned car for an auction lot. Condition here is
 * the displayed/paperwork baseline; hidden issues are drawn (weighted by
 * the model's hiddenIssueWeights) but stay unresolved — revealed=false —
 * until inspection or the sliding-scale lemon rule at handover
 * (resolveHandoverCondition). Always stock: buildSheet is empty, since an
 * auction car hasn't been touched yet (GDD: "buy rough, restore/build").
 * `currentYear` (Sprint 10, default Infinity = unrestricted) clamps the
 * rolled model year to the in-game calendar — see calendar.ts — so an
 * individual instance can't roll a still-impossible year even when its
 * model is otherwise eligible.
 */
export function generateAuctionCarInstance(
  model: CarModel,
  hiddenIssuesByZone: Readonly<Record<Zone, readonly HiddenIssue[]>>,
  id: string,
  rng: Rng,
  currentYear: number = Infinity,
): CarInstance {
  const hiddenIssues = model.hiddenIssueWeights.flatMap((weighted) => {
    if (rng.next() >= weighted.weight) return []
    const candidates = hiddenIssuesByZone[weighted.zone]
    if (candidates.length === 0) return []
    return [{ issueId: rng.pick(candidates).id, revealed: false }]
  })

  return {
    id,
    modelId: model.id,
    year: Math.min(model.spec.yearFrom + rng.int(0, 8), currentYear),
    mileageKm: rng.int(30_000, 180_000),
    color: rng.pick(COLOR_POOL),
    provenanceNote: rng.pick(PROVENANCE_POOL),
    condition: {
      engine: rng.int(30, 90),
      drivetrain: rng.int(30, 90),
      suspension: rng.int(30, 90),
      body: rng.int(30, 90),
      interior: rng.int(30, 90),
    },
    hiddenIssues,
    authenticityPercent: rng.int(60, 95),
    buildSheet: {
      engine: null,
      forcedInduction: null,
      drivetrain: null,
      suspension: null,
      brakes: null,
      bodyAero: null,
      wheelsInterior: null,
    },
  }
}

/**
 * Weekly catalog for one tier: one lot per eligible model that's in stock
 * this week, up to `count`. `currentYear` (Sprint 10, default Infinity =
 * unrestricted) also excludes any model whose `yearFrom` postdates the
 * in-game calendar — see calendar.ts — so a still-unreleased model can't
 * appear at auction (GDD 2.2: "new model years appear at auction over time").
 */
export function generateAuctionCatalog(
  models: readonly CarModel[],
  tier: AuctionTier,
  hiddenIssuesByZone: Readonly<Record<Zone, readonly HiddenIssue[]>>,
  day: number,
  count: number,
  expiresInDays: number,
  rng: Rng,
  currentYear: number = Infinity,
): AuctionLot[] {
  const eligible = models.filter(
    (model) => auctionTierForRarity(model.tier) === tier && model.spec.yearFrom <= currentYear,
  )
  if (eligible.length === 0) return []

  const lots: AuctionLot[] = []
  for (let i = 0; i < count; i++) {
    const model = rng.pick(eligible)
    const lotId = `lot-${day}-${tier}-${i}`
    const car = generateAuctionCarInstance(
      model,
      hiddenIssuesByZone,
      `car-${lotId}`,
      rng,
      currentYear,
    )
    lots.push({
      id: lotId,
      tier,
      modelId: model.id,
      car,
      bookValueYen: model.bookValueYen,
      inspected: false,
      expiresOnDay: day + expiresInDays,
    })
  }
  return lots
}

export function inspectLot(lot: AuctionLot): AuctionLot {
  return {
    ...lot,
    inspected: true,
    car: { ...lot.car, hiddenIssues: lot.car.hiddenIssues.map((i) => ({ ...i, revealed: true })) },
  }
}

export interface InspectLotResult {
  state: GameState
  log: DayLogEntry[]
}

/**
 * The instant inspect resolver (Sprint 11): reveals a lot's hidden issues
 * the moment it's clicked, for its cash travel fee only — no labor cost
 * (decision 4: labor is the tightest resource in the game, and gating a
 * look-before-you-buy action behind it wasn't buying any real tension).
 * Shared by the player's instant click and advanceDay's bot batch loop.
 */
export function resolveInspectLot(state: GameState, lotId: string): InspectLotResult {
  const lot = state.activeAuctionLots.find((l) => l.id === lotId)
  if (!lot || lot.inspected) return { state, log: [] }
  const fee = AUCTION_TRAVEL_FEE_YEN[lot.tier]
  if (state.cashYen < fee) return { state, log: [] }
  const inspected = inspectLot(lot)
  return {
    state: {
      ...state,
      cashYen: state.cashYen - fee,
      activeAuctionLots: state.activeAuctionLots.map((l) => (l.id === lotId ? inspected : l)),
    },
    log: [{ type: 'lot-inspected', lotId }],
  }
}

function applyIssueSeverity(car: CarInstance, zone: Zone, severity: number): CarInstance {
  return {
    ...car,
    condition: { ...car.condition, [zone]: Math.max(0, car.condition[zone] - severity) },
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * The sliding-scale lemon rule (GDD 6.5, Sprint 03 decision 2). Inspected
 * lots apply their rolled hidden-issue severity in full — no surprise, the
 * player saw it coming. Uninspected lots run each issue through a
 * discount-scaled variance roll: buying at or above book value dampens
 * the outcome to half the rolled severity (an annoyance, never a
 * showstopper); the further under book value the final price is, the
 * wider the swing opens both ways — near-zero (goldmine) to up to 3x the
 * rolled severity (lemon). First-pass formula, explicitly tunable.
 */
export function resolveHandoverCondition(
  lot: AuctionLot,
  finalPriceYen: number,
  hiddenIssueCatalog: Readonly<Record<string, HiddenIssue>>,
  rng: Rng,
): CarInstance {
  let car = lot.car
  const revealed = lot.inspected

  const discount = clamp((lot.bookValueYen - finalPriceYen) / lot.bookValueYen, -1, 1)
  const varianceFactor = Math.max(0, discount)

  for (const issue of car.hiddenIssues) {
    const catalogEntry = hiddenIssueCatalog[issue.issueId]
    if (!catalogEntry) continue
    const rolledSeverity = rng.int(catalogEntry.severityMin, catalogEntry.severityMax)
    const multiplier = revealed
      ? 1
      : varianceFactor === 0
        ? 0.5
        : rng.next() * (1 + varianceFactor * 2)
    const finalSeverity = clamp(rolledSeverity * multiplier, 0, 100)
    car = applyIssueSeverity(car, catalogEntry.zone, finalSeverity)
  }

  return { ...car, hiddenIssues: car.hiddenIssues.map((i) => ({ ...i, revealed: true })) }
}

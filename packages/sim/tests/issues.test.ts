import {
  ECONOMY,
  type CarInstance,
  type CarModel,
  type HiddenIssue,
} from '@midnight-garage/content'
import { describe, expect, it } from 'vitest'
import {
  effectiveComponentCondition,
  issueLaborSlots,
  issuePenaltyYen,
  issueRepairCostYen,
  issueSeverityBand,
  maxUnrepairedSeverity,
  modelRiskDiscount,
} from '../src/issues'

const ENGINE_ISSUE: HiddenIssue = {
  id: 'test-engine-issue',
  componentId: 'engine',
  severityMin: 10,
  severityMax: 90,
  hintText: 'a worrying knock',
  repairCostBaseYen: 100_000,
}

const BODY_ISSUE: HiddenIssue = {
  id: 'test-body-issue',
  componentId: 'body',
  severityMin: 10,
  severityMax: 90,
  hintText: 'visible rust',
  repairCostBaseYen: 50_000,
}

const ISSUES_BY_ID: Readonly<Record<string, HiddenIssue>> = {
  [ENGINE_ISSUE.id]: ENGINE_ISSUE,
  [BODY_ISSUE.id]: BODY_ISSUE,
}

const ISSUES_BY_COMPONENT: Readonly<Record<string, readonly HiddenIssue[]>> = {
  engine: [ENGINE_ISSUE],
  body: [BODY_ISSUE],
}

function carWith(overrides: {
  hiddenIssues?: CarInstance['hiddenIssues']
  engineCondition?: number
}): CarInstance {
  return {
    id: 'car-0001',
    modelId: 'test-model',
    year: 1990,
    mileageKm: 100_000,
    color: 'White',
    provenanceNote: '',
    hiddenIssues: overrides.hiddenIssues ?? [],
    authenticityPercent: 90,
    components: {
      engine: { condition: overrides.engineCondition ?? 100, installed: null },
      forcedInduction: { condition: 100, installed: null },
      drivetrain: { condition: 100, installed: null },
      suspension: { condition: 100, installed: null },
      brakes: { condition: 100, installed: null },
      wheels: { condition: 100, installed: null },
      body: { condition: 100, installed: null },
      interior: { condition: 100, installed: null },
    },
  }
}

describe('maxUnrepairedSeverity / effectiveComponentCondition', () => {
  it('is 0 for a component with no issues', () => {
    const car = carWith({})
    expect(maxUnrepairedSeverity(car, 'engine', ISSUES_BY_ID)).toBe(0)
    expect(effectiveComponentCondition(car, 'engine', ISSUES_BY_ID)).toBe(100)
  })

  it('drags effective condition below raw condition for an unrepaired issue', () => {
    // Sprint 22's own worked example: repair-zone to raw 100, unrepaired
    // severity 40 -> effective 60 (min(100, 100 - 40)).
    const car = carWith({
      engineCondition: 100,
      hiddenIssues: [
        { issueId: ENGINE_ISSUE.id, revealed: true, severityPercent: 40, repaired: false },
      ],
    })
    expect(maxUnrepairedSeverity(car, 'engine', ISSUES_BY_ID)).toBe(40)
    expect(effectiveComponentCondition(car, 'engine', ISSUES_BY_ID)).toBe(60)
  })

  it('ignores a repaired issue entirely', () => {
    const car = carWith({
      engineCondition: 100,
      hiddenIssues: [
        { issueId: ENGINE_ISSUE.id, revealed: true, severityPercent: 80, repaired: true },
      ],
    })
    expect(effectiveComponentCondition(car, 'engine', ISSUES_BY_ID)).toBe(100)
  })

  it('never exceeds raw condition even with a very low severity', () => {
    const car = carWith({
      engineCondition: 50,
      hiddenIssues: [
        { issueId: ENGINE_ISSUE.id, revealed: true, severityPercent: 5, repaired: false },
      ],
    })
    expect(effectiveComponentCondition(car, 'engine', ISSUES_BY_ID)).toBe(50)
  })

  it('a different component is unaffected by an issue on this one', () => {
    const car = carWith({
      hiddenIssues: [
        { issueId: ENGINE_ISSUE.id, revealed: true, severityPercent: 90, repaired: false },
      ],
    })
    expect(effectiveComponentCondition(car, 'body', ISSUES_BY_ID)).toBe(100)
  })
})

describe('issueRepairCostYen', () => {
  it('a severity roll exactly equal to costDivisor (50) costs exactly repairCostBaseYen', () => {
    expect(issueRepairCostYen(ENGINE_ISSUE, 50, ECONOMY)).toBe(ENGINE_ISSUE.repairCostBaseYen)
  })

  it('a severity of 25 costs half', () => {
    expect(issueRepairCostYen(ENGINE_ISSUE, 25, ECONOMY)).toBe(ENGINE_ISSUE.repairCostBaseYen / 2)
  })

  it('rounds to the nearest Y1,000', () => {
    const issue: HiddenIssue = { ...ENGINE_ISSUE, repairCostBaseYen: 100_333 }
    expect(issueRepairCostYen(issue, 50, ECONOMY)).toBe(100_000)
  })
})

describe('issuePenaltyYen', () => {
  it('is 0 with no unrepaired issues', () => {
    const car = carWith({
      hiddenIssues: [
        { issueId: ENGINE_ISSUE.id, revealed: true, severityPercent: 60, repaired: true },
      ],
    })
    expect(issuePenaltyYen(car, ISSUES_BY_ID, ECONOMY)).toBe(0)
  })

  it('sums every unrepaired issue at penaltyMultiplier over its repair cost', () => {
    const car = carWith({
      hiddenIssues: [
        { issueId: ENGINE_ISSUE.id, revealed: true, severityPercent: 50, repaired: false },
        { issueId: BODY_ISSUE.id, revealed: true, severityPercent: 50, repaired: false },
      ],
    })
    const expected = Math.round(
      (ENGINE_ISSUE.repairCostBaseYen + BODY_ISSUE.repairCostBaseYen) *
        ECONOMY.issues.penaltyMultiplier,
    )
    expect(issuePenaltyYen(car, ISSUES_BY_ID, ECONOMY)).toBe(expected)
  })
})

describe('modelRiskDiscount', () => {
  const highRiskModel: Pick<CarModel, 'bookValueYen' | 'hiddenIssueWeights'> = {
    bookValueYen: 1_000_000,
    hiddenIssueWeights: [{ componentId: 'engine', weight: 1 }],
  }
  const noRiskModel: Pick<CarModel, 'bookValueYen' | 'hiddenIssueWeights'> = {
    bookValueYen: 1_000_000,
    hiddenIssueWeights: [],
  }

  it('is 0 for a model with no hidden-issue weights', () => {
    expect(modelRiskDiscount(noRiskModel as CarModel, ISSUES_BY_COMPONENT, ECONOMY)).toBe(0)
  })

  it('is positive for a model with real hidden-issue weight', () => {
    expect(
      modelRiskDiscount(highRiskModel as CarModel, ISSUES_BY_COMPONENT, ECONOMY),
    ).toBeGreaterThan(0)
  })

  it('never exceeds maxRiskDiscount', () => {
    const extremeModel: Pick<CarModel, 'bookValueYen' | 'hiddenIssueWeights'> = {
      bookValueYen: 10_000, // tiny book value makes the cost fraction huge
      hiddenIssueWeights: [{ componentId: 'engine', weight: 1 }],
    }
    const discount = modelRiskDiscount(extremeModel as CarModel, ISSUES_BY_COMPONENT, ECONOMY)
    expect(discount).toBeLessThanOrEqual(ECONOMY.issues.maxRiskDiscount)
  })
})

describe('issueSeverityBand / issueLaborSlots', () => {
  const [minorMax, seriousMax] = ECONOMY.issues.severityBands
  const [minorSlots, seriousSlots, severeSlots] = ECONOMY.issues.laborSlotsByBand

  it('bands severity into minor/serious/severe at the configured breakpoints', () => {
    expect(issueSeverityBand(0, ECONOMY)).toBe('minor')
    expect(issueSeverityBand(minorMax - 1, ECONOMY)).toBe('minor')
    expect(issueSeverityBand(minorMax, ECONOMY)).toBe('serious')
    expect(issueSeverityBand(seriousMax - 1, ECONOMY)).toBe('serious')
    expect(issueSeverityBand(seriousMax, ECONOMY)).toBe('severe')
    expect(issueSeverityBand(100, ECONOMY)).toBe('severe')
  })

  it('labor slots follow the same bands', () => {
    expect(issueLaborSlots(0, ECONOMY)).toBe(minorSlots)
    expect(issueLaborSlots(minorMax, ECONOMY)).toBe(seriousSlots)
    expect(issueLaborSlots(seriousMax, ECONOMY)).toBe(severeSlots)
  })
})

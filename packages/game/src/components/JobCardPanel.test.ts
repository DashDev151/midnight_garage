import type { RepairJobCard } from '@midnight-garage/sim'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import JobCardPanel from './JobCardPanel.vue'

/**
 * The job card panel is a price list: it renders what the sim's cards say and
 * nothing else. These tests pin the five locked route labels, the two summed
 * all-in figures, and the rule that the panel is never itself a control.
 */

const SHOP_NAME = 'Machine Shop'

function makeCard(overrides: Partial<RepairJobCard> = {}): RepairJobCard {
  return {
    kind: 'service',
    targetBand: 'worn',
    offered: true,
    route: 'own',
    hireFeeYen: null,
    stepsDone: 0,
    steps: [],
    energyPoints: 12,
    removalEnergyPoints: 6,
    partsYen: 6600,
    ...overrides,
  }
}

describe('JobCardPanel', () => {
  it('renders no buttons anywhere: it is a price list, never a control', () => {
    const wrapper = mount(JobCardPanel, {
      props: {
        cards: [makeCard(), makeCard({ kind: 'rebuild' }), makeCard({ kind: 'restore' })],
        shopName: SHOP_NAME,
      },
    })
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('own route: green "own", and the all-in figures with no hire fee folded in', () => {
    const wrapper = mount(JobCardPanel, {
      props: { cards: [makeCard({ route: 'own' })], shopName: SHOP_NAME },
    })
    const row = wrapper.get('[data-test="job-card-service"]')
    expect(row.text()).toContain('Service')
    const chip = wrapper.get('[data-test="job-card-route-service"]')
    expect(chip.text()).toBe('own')
    expect(chip.classes()).toContain('job-route-own')
    expect(wrapper.get('[data-test="job-card-cost-service"]').text()).toBe('18 energy · ¥6,600')
  })

  it('hired-today route: green "hired today"', () => {
    const wrapper = mount(JobCardPanel, {
      props: { cards: [makeCard({ kind: 'rebuild', route: 'hired-today' })], shopName: SHOP_NAME },
    })
    const chip = wrapper.get('[data-test="job-card-route-rebuild"]')
    expect(chip.text()).toBe('hired today')
    expect(chip.classes()).toContain('job-route-hired-today')
  })

  it('hire route: yellow "hire {fee}", the fee folded into the all-in yen figure', () => {
    const wrapper = mount(JobCardPanel, {
      props: {
        cards: [makeCard({ kind: 'restore', route: 'hire', hireFeeYen: 3000 })],
        shopName: SHOP_NAME,
      },
    })
    const chip = wrapper.get('[data-test="job-card-route-restore"]')
    expect(chip.text()).toBe('hire ¥3,000')
    expect(chip.classes()).toContain('job-route-hire')
    // partsYen 6,600 + hireFeeYen 3,000 = 9,600; energyPoints 12 + removalEnergyPoints 6 = 18.
    expect(wrapper.get('[data-test="job-card-cost-restore"]').text()).toBe('18 energy · ¥9,600')
  })

  it('slog route: amber "slog x3"', () => {
    const wrapper = mount(JobCardPanel, {
      props: { cards: [makeCard({ route: 'slog' })], shopName: SHOP_NAME },
    })
    const chip = wrapper.get('[data-test="job-card-route-service"]')
    expect(chip.text()).toBe('slog x3')
    expect(chip.classes()).toContain('job-route-slog')
  })

  it('locked on a shop-tier tool: grey "needs the {shop}"', () => {
    const wrapper = mount(JobCardPanel, {
      props: {
        cards: [makeCard({ route: 'locked', lockedReason: 'needs-shop' })],
        shopName: SHOP_NAME,
      },
    })
    const chip = wrapper.get('[data-test="job-card-route-service"]')
    expect(chip.text()).toBe(`needs the ${SHOP_NAME}`)
    expect(chip.classes()).toContain('job-route-locked')
  })

  it('locked on an unowned machine: grey "needs the {machine}", named off the first step', () => {
    const wrapper = mount(JobCardPanel, {
      props: {
        cards: [
          makeCard({
            route: 'locked',
            lockedReason: 'needs-machine',
            steps: [
              { tool: 'lift', toolLabel: 'Lift', copy: 'Get it up on the lift.', slogged: false },
            ],
          }),
        ],
        shopName: SHOP_NAME,
      },
    })
    const chip = wrapper.get('[data-test="job-card-route-service"]')
    expect(chip.text()).toBe('needs the Lift')
    expect(chip.classes()).toContain('job-route-locked')
  })

  it('sums energy and yen independently per card across a full three-job panel', () => {
    const wrapper = mount(JobCardPanel, {
      props: {
        cards: [
          makeCard({
            kind: 'service',
            energyPoints: 4,
            removalEnergyPoints: 0,
            partsYen: 0,
            route: 'own',
          }),
          makeCard({
            kind: 'rebuild',
            energyPoints: 10,
            removalEnergyPoints: 6,
            partsYen: 12000,
            route: 'hire',
            hireFeeYen: 3000,
          }),
          makeCard({
            kind: 'restore',
            energyPoints: 20,
            removalEnergyPoints: 6,
            partsYen: 40000,
            route: 'slog',
          }),
        ],
        shopName: SHOP_NAME,
      },
    })
    expect(wrapper.get('[data-test="job-card-cost-service"]').text()).toBe('4 energy · ¥0')
    expect(wrapper.get('[data-test="job-card-cost-rebuild"]').text()).toBe('16 energy · ¥15,000')
    expect(wrapper.get('[data-test="job-card-cost-restore"]').text()).toBe('26 energy · ¥40,000')
    expect(wrapper.findAll('li.job-card')).toHaveLength(3)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })
})

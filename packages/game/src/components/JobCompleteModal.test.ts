import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../stores/gameStore'
import JobCompleteModal from './JobCompleteModal.vue'

describe('JobCompleteModal', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders nothing when there is no result', () => {
    const wrapper = mount(JobCompleteModal)
    expect(wrapper.find('[data-test="job-complete-modal"]').exists()).toBe(false)
  })

  it('shows the real repair/parts costs and a signed net profit for a paid job (Sprint 57)', () => {
    const game = useGameStore()
    game.lastJobResult = {
      outcome: 'paid',
      customerName: 'Test Customer',
      taskLabels: ['Suspension repair to fine'],
      payoutYen: 50_000,
      reputationDelta: 6,
      repairCostYen: 8_000,
      partsCostYen: 0,
      netProfitYen: 42_000,
      specialtyGained: {
        engine: 0,
        drivetrain: 0,
        suspension: 6,
        wheels: 0,
        body: 0,
        interior: 0,
      },
    }
    const wrapper = mount(JobCompleteModal)
    expect(wrapper.find('[data-test="job-complete-modal"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Repair cost')
    expect(wrapper.text()).toContain('Net profit')
    const netProfitEl = wrapper.find('[data-test="job-result-net-profit"]')
    expect(netProfitEl.text()).toContain('42,000')
    expect(netProfitEl.classes()).toContain('up')
    // The specialty gain renders with a real group name, not a raw id.
    expect(wrapper.text()).toContain('Suspension')
  })

  it('shows sunk cost (a negative net profit) for a failed job - honesty cuts both ways', () => {
    const game = useGameStore()
    game.lastJobResult = {
      outcome: 'failed',
      customerName: 'Test Customer',
      taskLabels: ['Suspension repair to fine'],
      payoutYen: 0,
      reputationDelta: -4,
      repairCostYen: 5_000,
      partsCostYen: 0,
      netProfitYen: -5_000,
      specialtyGained: {
        engine: 0,
        drivetrain: 0,
        suspension: -4,
        wheels: 0,
        body: 0,
        interior: 0,
      },
    }
    const wrapper = mount(JobCompleteModal)
    expect(wrapper.text()).toContain('Sunk cost')
    const netProfitEl = wrapper.find('[data-test="job-result-net-profit"]')
    expect(netProfitEl.classes()).toContain('down')
  })

  it('omits the repair/parts cost lines entirely when nothing was spent', () => {
    const game = useGameStore()
    game.lastJobResult = {
      outcome: 'paid',
      customerName: 'Test Customer',
      taskLabels: ['Suspension repair to fine'],
      payoutYen: 20_000,
      reputationDelta: 3,
      repairCostYen: 0,
      partsCostYen: 0,
      netProfitYen: 20_000,
      specialtyGained: {
        engine: 0,
        drivetrain: 0,
        suspension: 3,
        wheels: 0,
        body: 0,
        interior: 0,
      },
    }
    const wrapper = mount(JobCompleteModal)
    expect(wrapper.text()).not.toContain('Repair cost')
    expect(wrapper.text()).not.toContain('Parts cost')
  })
})

<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { StaffMemberCardView } from '../stores/staffStore'
import { useStaffStore } from '../stores/staffStore'
import { useGameStore } from '../stores/gameStore'
import { formatYen } from '../utils/formatYen'
import { venueLabelFor } from '../utils/auctionTierLabels'

/** The Staff Office renders the shop's two staff panels - the current crew and
 * the ad-reply candidates the weekly refresh posts. Hiring, dismissal, and the
 * bench/contract reassignment are instant store actions (reassignment lands on
 * the next day boundary). Diegetic framing (art bible): the board reads as
 * pinned notices, not a menu of stat blocks. The labour and the assignment are
 * live controls.
 */
const staff = useStaffStore()
// The game store carries the labour-point scale so the crew-labour display can
// show what a member adds to the day's pool (points), not raw slots.
const game = useGameStore()

const view = computed(() => staff.staffOfficeView)

/** The local tier's rolled venue name, so flavour lines name the real place. */
const localVenueName = computed(() => venueLabelFor('local-yard', game.gameState.venueNameByTier))

/** The staff id whose dismissal is mid-confirm (two-step), or null. */
const confirmingDismissId = ref<string | null>(null)

function askDismiss(id: string): void {
  confirmingDismissId.value = id
}

function cancelDismiss(): void {
  confirmingDismissId.value = null
}

function confirmDismiss(id: string): void {
  staff.dismissStaff(id)
  confirmingDismissId.value = null
}

function hire(id: string): void {
  staff.hireStaff(id)
}

/** The state the member is heading for (a pending switch, else where they are
 * now). The toggle flips it; setting it back to the effective assignment simply
 * clears the pending change. */
function intendedAssignment(member: StaffMemberCardView): 'bench' | 'contract' {
  return member.pendingAssignment ?? member.assignment
}

function toggleAssignment(member: StaffMemberCardView): void {
  const to = intendedAssignment(member) === 'bench' ? 'contract' : 'bench'
  staff.reassignStaff(member.id, to)
}
</script>

<template>
  <section class="staff-office" data-test="staff-office">
    <RouterLink :to="{ name: 'garage' }" class="back">&lt; Garage</RouterLink>
    <h2>Staff Office</h2>

    <section class="panel" data-test="roster-panel">
      <h3>Your crew</h3>
      <p class="hint">
        Up to {{ view.maxStaff }} on the books. At the bench their hands are yours; on a fleet
        contract they earn a steady retainer instead. Wages come out weekly.
      </p>
      <p v-if="view.benchCrew" class="crew-line" data-test="bench-crew">
        At the bench: engine {{ view.benchCrew.engine }}, chassis {{ view.benchCrew.chassis }}, body
        {{ view.benchCrew.body }}. The strongest hand leads each job.<span
          v-if="view.benchCrew.perfectionist"
          data-test="bench-perfectionist"
        >
          A perfectionist at the bench: work runs slower, wastes less.</span
        ><span v-if="view.benchCrew.auctionRat" data-test="bench-auction-rat">
          An auction rat at the bench: extra time at {{ localVenueName }}.</span
        >
      </p>
      <p v-else-if="view.roster.length > 0" class="crew-line dim" data-test="bench-crew-empty">
        Nobody at the bench. Repairs run at the shop's own pace.
      </p>
      <p v-if="view.roster.length === 0" class="empty" data-test="roster-empty">
        Nobody on the books yet. Take someone on from the board below.
      </p>
      <ul v-else class="cards">
        <li
          v-for="member in view.roster"
          :key="member.id"
          class="card"
          :data-test="'staff-' + member.id"
        >
          <div class="card-head">
            <span class="name" data-test="staff-name">{{ member.displayName }}</span>
            <span class="wage" data-test="staff-wage"
              >{{ formatYen(member.weeklyWageYen) }}/wk</span
            >
          </div>
          <p class="stats">
            Engine {{ member.stats.engine }} &middot; Chassis {{ member.stats.chassis }} &middot;
            Body {{ member.stats.body }}
          </p>
          <!-- Shows the labour they add to the day (laborSlotsPerDay x pointsPerLabour), not the raw slot count. -->
          <p class="slot-note" data-test="staff-labour">
            +{{ member.laborSlotsPerDay * game.pointsPerLabour }} labour/day
          </p>
          <p class="trait">
            <strong>{{ member.traitName }}.</strong> {{ member.traitDescription }}
          </p>
          <div class="assignment" :data-test="'assign-' + member.id">
            <span class="assign-state" :data-test="'assign-state-' + member.id">{{
              member.assignment === 'bench' ? 'Working the bench.' : 'On the fleet contract.'
            }}</span>
            <span
              v-if="member.pendingAssignment"
              class="assign-pending"
              :data-test="'assign-pending-' + member.id"
              >{{
                member.pendingAssignment === 'bench'
                  ? 'Back to the bench tomorrow.'
                  : 'On the fleet contract tomorrow.'
              }}</span
            >
            <button
              type="button"
              class="ghost"
              :data-test="'assign-toggle-' + member.id"
              @click="toggleAssignment(member)"
            >
              {{
                intendedAssignment(member) === 'bench'
                  ? 'Put on the fleet contract'
                  : 'Bring back to the bench'
              }}
            </button>
          </div>
          <div class="actions">
            <template v-if="confirmingDismissId === member.id">
              <span class="confirm-copy">Let {{ member.displayName }} go?</span>
              <button
                type="button"
                class="danger"
                :data-test="'dismiss-confirm-' + member.id"
                @click="confirmDismiss(member.id)"
              >
                Confirm
              </button>
              <button type="button" class="ghost" @click="cancelDismiss">Cancel</button>
            </template>
            <button
              v-else
              type="button"
              class="ghost"
              :data-test="'dismiss-' + member.id"
              @click="askDismiss(member.id)"
            >
              Let go
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="panel" data-test="ads-panel">
      <h3>Answered the ad</h3>
      <p v-if="view.atCap" class="hint at-cap" data-test="staff-cap">
        The shop's full. Let someone go before you take on anyone new.
      </p>
      <p v-else class="hint">Fresh notices go up as the week turns.</p>
      <p v-if="view.ads.length === 0" class="empty" data-test="ads-empty">
        Nothing pinned up right now. Check back after the week turns.
      </p>
      <ul v-else class="cards">
        <li v-for="ad in view.ads" :key="ad.id" class="card" :data-test="'ad-' + ad.id">
          <div class="card-head">
            <span class="name" data-test="ad-name">{{ ad.displayName }}</span>
            <span class="wage" data-test="ad-wage">{{ formatYen(ad.weeklyWageYen) }}/wk</span>
          </div>
          <p class="bio">{{ ad.bio }}</p>
          <p class="stats">
            Engine {{ ad.stats.engine }} &middot; Chassis {{ ad.stats.chassis }} &middot; Body
            {{ ad.stats.body }}
          </p>
          <!-- Labour added to the day. -->
          <p class="slot-note" data-test="ad-labour">
            +{{ ad.laborSlotsPerDay * game.pointsPerLabour }} labour/day
          </p>
          <p class="trait">
            <strong>{{ ad.traitName }}.</strong> {{ ad.traitDescription }}
          </p>
          <p v-if="ad.introFeeYen > 0" class="fee" :data-test="'ad-fee-' + ad.id">
            Introduction fee {{ formatYen(ad.introFeeYen) }}.
          </p>
          <div class="actions">
            <span class="posted"
              >Posted day {{ ad.postedOnDay }}, down day {{ ad.expiresOnDay }}</span
            >
            <button
              type="button"
              class="hire"
              :data-test="'hire-' + ad.id"
              :disabled="view.atCap"
              @click="hire(ad.id)"
            >
              Take them on
            </button>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.staff-office {
  max-width: 640px;
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: var(--mg-space-2) 0 var(--mg-space-3);
}

h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.panel {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-3);
  margin-bottom: var(--mg-space-3);
}

.hint,
.empty {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.hint.at-cap {
  color: var(--mg-neon-pink);
}

.crew-line {
  margin: 0 0 var(--mg-space-3);
  color: var(--mg-success);
  font-size: var(--mg-fs-sm);
}

.crew-line.dim {
  color: var(--mg-text-dim);
}

.cards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--mg-space-2);
}

.card {
  border-top: var(--mg-border);
  padding-top: var(--mg-space-2);
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.name {
  color: var(--mg-text);
}

.wage {
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.bio {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
  font-style: italic;
}

.stats {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.slot-note {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-success);
  font-size: var(--mg-fs-sm);
}

.fee {
  margin: var(--mg-space-1) 0 0;
  color: var(--mg-yen);
  font-size: var(--mg-fs-sm);
}

.assignment {
  display: flex;
  gap: var(--mg-space-2);
  align-items: baseline;
  flex-wrap: wrap;
  margin: var(--mg-space-2) 0;
}

.assign-state {
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
}

.assign-pending {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-sm);
  margin-right: auto;
}

.trait {
  margin: var(--mg-space-1) 0 var(--mg-space-2);
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
}

.trait strong {
  color: var(--mg-neon-cyan);
}

.actions {
  display: flex;
  gap: var(--mg-space-2);
  align-items: center;
  flex-wrap: wrap;
}

.posted {
  color: var(--mg-text-dim);
  font-size: var(--mg-fs-sm);
  margin-right: auto;
}

.confirm-copy {
  color: var(--mg-text);
  font-size: var(--mg-fs-sm);
  margin-right: auto;
}

button {
  font-family: inherit;
  cursor: pointer;
  border-radius: 4px;
  padding: var(--mg-space-1) var(--mg-space-3);
}

.hire {
  background: var(--mg-neon-violet);
  color: var(--mg-bg);
  border: none;
}

.hire:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ghost {
  background: transparent;
  color: var(--mg-text-dim);
  border: 1px solid var(--mg-panel-edge);
}

.danger {
  background: var(--mg-neon-pink);
  color: var(--mg-bg);
  border: none;
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

/**
 * The Shop Manual - reference prose kept out of the working screens, which
 * carry only short, in-voice labels. Anything a player might want to read
 * twice lives here instead. A plain list of entries, no search, no nesting -
 * reached from the pause menu alongside Settings.
 */

interface CompendiumEntry {
  id: string
  title: string
  paragraphs: readonly string[]
}

const ENTRIES: readonly CompendiumEntry[] = [
  {
    id: 'workshop',
    title: 'The workshop and stations',
    paragraphs: [
      'Three places do the actual work: the bench, the machine shop, and the body line.',
      "The bench puts a part right - fetched out of the warehouse, worked there, one at a time, and returned when you're done. It's open from day one; only the tools on hand decide how far a repair climbs.",
      'The machine shop cuts metal off a part you already own rather than mending it back to how it was. No car goes anywhere near it - a part goes in, gets cut, comes back out. The station is never locked; what limits a cut is which machines are actually standing in it.',
      'The body line works the whole car rather than one part, panel by panel, zone by zone - and needs its own tools before it opens at all.',
      'Carry a part to any station by dragging it there from your parts list, or picking it up and placing it by hand. Either way is free.',
      'Bays hold the cars. Arrive with none free and the car parks over the limit rather than vanishing; it moves itself into a real bay the moment one opens, and a fine runs until then.',
    ],
  },
  {
    id: 'body-paint',
    title: 'Body and paint',
    paragraphs: [
      "A car's body is nine zones, and each carries its own condition, same poor-to-mint reading as everything else in the shop. The worst zone sets the whole car's bodywork reading; the worst finish sets its paint reading.",
      "Bringing a bad zone back is a chain: beat the dents out, weld what's torn, fill and sand what's left, then prime it. A panel too far gone gets swapped rather than beaten straight. Paint comes after, its own step - strip what's there, then lay down a colour from a tin off your shelf.",
      "Better tools don't skip steps; they raise the ceiling. Hand work gets a zone to a fair state, and the proper line carries the finish the rest of the way. Welding is the one job that will not happen without the welder - rot waits for the kit or for a fresh panel, whichever arrives first.",
    ],
  },
  {
    id: 'parts',
    title: 'Buying parts and fitment',
    paragraphs: [
      'Every part on the shelf is graded, same rough idea as the car itself: a plain street part, and grades above it that cost more and give more.',
      'A part still has to fit the specific car - wrong platform, wrong class, and it sits on the shelf looking at you rather than going on. The parts market tells you which is which before you spend anything.',
      "Fitting a part that isn't what the car left the factory with costs it some originality. Worth doing for a build - not worth doing by accident.",
    ],
  },
  {
    id: 'selling',
    title: 'Selling and channels',
    paragraphs: [
      'A car goes up for sale on a channel, not just "for sale" in general. Each one reaches a different sort of buyer, keeps the listing open for a different stretch, and takes its own cut. Listing moves the car onto the forecourt from wherever it was parked; delisting moves it back - you cannot put a car there by hand.',
      "What a buyer offers isn't the sticker price. It starts from the book price, comes down for whatever's still broken, and comes down again for any doubt about what's actually wrong - fix the fault, or prove it isn't there, and that discount disappears. Genuine upgrades add back on top.",
      'An offer is good for the day it arrives. Take it or leave it - the car stays listed either way until you say otherwise.',
    ],
  },
  {
    id: 'labour',
    title: 'Labour and the working day',
    paragraphs: [
      "Labour is the day's real currency - one pool, shared across every car in the shop. Coffee stretches it a little; End Day is what resets it.",
      'Moving a car between parking and a bay is free. So is pulling a part off, or carrying one between the warehouse and a station. It is the actual work - repairing, fitting, cutting, painting - that spends the pool.',
      'A job too big for what is left today does not vanish. It sits open and picks up again tomorrow, exactly where it stopped.',
    ],
  },
  {
    id: 'machine-hire',
    title: 'Machine hire versus buying tools',
    paragraphs: [
      "A machine shop line can be owned outright or hired for a single day. Ownership costs more up front but it's yours for good; hiring pays a flat fee and buys the run of that line until you end the day - every car, every operation it does.",
      "Either way it never shows up on one car's own bill. It's a running cost, same as rent - the shop's overhead, not that car's.",
    ],
  },
  {
    id: 'phone',
    title: 'The phone: customer jobs',
    paragraphs: [
      "Customers ring in through the day asking for work. Book one in and the car turns up the next morning with its tasks already attached, so you know what it needs before it's on the ramp.",
      'Finish the work, then hand the car back from the phone to get paid and bank the reputation it earns. Hand it back unfinished and you forfeit the payout.',
    ],
  },
]

const selectedId = ref<string>(ENTRIES[0]!.id)

const selectedEntry = computed<CompendiumEntry>(
  () => ENTRIES.find((entry) => entry.id === selectedId.value) ?? ENTRIES[0]!,
)

function select(id: string): void {
  selectedId.value = id
}
</script>

<template>
  <section class="compendium">
    <RouterLink :to="{ name: 'menu' }" class="back">&lt; Menu</RouterLink>
    <h2>The Shop Manual</h2>

    <nav class="entry-list" data-test="compendium-entry-list">
      <button
        v-for="entry in ENTRIES"
        :key="entry.id"
        type="button"
        class="entry-btn"
        :class="{ active: selectedId === entry.id }"
        :data-test="'compendium-entry-' + entry.id"
        @click="select(entry.id)"
      >
        {{ entry.title }}
      </button>
    </nav>

    <article class="entry-body" data-test="compendium-entry-body">
      <h3>{{ selectedEntry.title }}</h3>
      <p v-for="(paragraph, i) in selectedEntry.paragraphs" :key="i">{{ paragraph }}</p>
    </article>
  </section>
</template>

<style scoped>
.compendium {
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-3);
}

.back {
  color: var(--mg-text-dim);
  text-decoration: none;
  font-size: var(--mg-fs-sm);
}

h2 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-lg);
  margin: 0;
}

.entry-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-2);
}

.entry-btn {
  background: var(--mg-panel);
  color: var(--mg-text-dim);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-2) var(--mg-space-3);
  font-family: inherit;
  font-size: var(--mg-fs-sm);
  cursor: pointer;
}

.entry-btn.active {
  color: var(--mg-neon-cyan);
  border-color: var(--mg-neon-cyan);
}

.entry-body {
  background: var(--mg-panel);
  border: var(--mg-border);
  border-radius: var(--mg-radius);
  padding: var(--mg-space-4);
}

.entry-body h3 {
  color: var(--mg-neon-violet);
  font-size: var(--mg-fs-md);
  margin: 0 0 var(--mg-space-2);
}

.entry-body p {
  color: var(--mg-text);
  font-family: var(--mg-font-reading);
  font-size: var(--mg-fs-sm);
  line-height: 1.5;
  margin: 0 0 var(--mg-space-3);
}

.entry-body p:last-child {
  margin-bottom: 0;
}
</style>

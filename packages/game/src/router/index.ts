import { createMemoryHistory, createRouter } from 'vue-router'
import { clearDragSession } from '../composables/useDragAndDrop'

/**
 * Memory-history routing (decision 1, sprint04.md): the router API - named
 * routes, per-screen lazy-loading, transitions - without any URL coupling.
 * The game ships in an itch.io iframe where URL/hash routing fights the
 * embedding, and players shouldn't be able to deep-link into screens or
 * break flow with the browser back button. Screens are lazy-imported so
 * the code-splitting pattern is set from the first route.
 */
export const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'garage', component: () => import('../screens/GarageScreen.vue') },
    { path: '/car/:id', name: 'car', component: () => import('../screens/CarDetailScreen.vue') },
    {
      path: '/auctions',
      name: 'auctions',
      component: () => import('../screens/AuctionScreen.vue'),
    },
    { path: '/parts', name: 'parts', component: () => import('../screens/PartsMarketScreen.vue') },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('../screens/PartsInventoryScreen.vue'),
    },
    { path: '/jobs', name: 'jobs', component: () => import('../screens/ServiceJobsScreen.vue') },
    {
      path: '/upgrades',
      name: 'upgrades',
      component: () => import('../screens/UpgradesScreen.vue'),
    },
    { path: '/spike', name: 'spike', component: () => import('../screens/SpikeScreen.vue') },
  ],
})

/**
 * Sprint 24 fix 1: a drag/pick session is module-level state that outlives
 * the component that started it (`useDragAndDrop.ts`'s own header comment).
 * Without this, navigating away mid-pick (e.g. picking a part, then tapping
 * back to the garage) left a stale session alive - the next screen's
 * Replace click would silently short-circuit against a payload the user has
 * no way to see or intend anymore. A navigation always ends any in-flight
 * pick/drag.
 */
router.afterEach(() => clearDragSession())

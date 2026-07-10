import { createMemoryHistory, createRouter } from 'vue-router'

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
    { path: '/jobs', name: 'jobs', component: () => import('../screens/ServiceJobsScreen.vue') },
    {
      path: '/upgrades',
      name: 'upgrades',
      component: () => import('../screens/UpgradesScreen.vue'),
    },
    { path: '/spike', name: 'spike', component: () => import('../screens/SpikeScreen.vue') },
  ],
})

import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { clearDragSession } from '../composables/useDragAndDrop'

/**
 * Dev-only routes (the art-spike sandbox and the auction-room demo) register
 * only in dev builds - `import.meta.env.DEV` folds to a literal `false` in
 * production, so these routes never reach a shipped build. The screens
 * themselves stay in the tree; only the reachability is gated.
 */
const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      { path: '/spike', name: 'spike', component: () => import('../screens/SpikeScreen.vue') },
      {
        path: '/auction-room-demo',
        name: 'auction-room-demo',
        component: () => import('../screens/AuctionRoomDemoScreen.vue'),
      },
      {
        path: '/inspection-demo',
        name: 'inspection-demo',
        component: () => import('../screens/InspectionDemoScreen.vue'),
      },
      {
        path: '/performance-sandbox',
        name: 'performance-sandbox',
        component: () => import('../screens/PerformanceSandboxScreen.vue'),
      },
      {
        path: '/paint-palette',
        name: 'paint-palette',
        component: () => import('../screens/PaintPaletteScreen.vue'),
      },
      {
        path: '/economy-bench',
        name: 'economy-bench',
        component: () => import('../screens/EconomyBenchScreen.vue'),
      },
    ]
  : []

/**
 * Memory-history routing: the router uses named routes, per-screen
 * lazy-loading, and transitions without any URL coupling. The game ships in
 * an embedded webview (a Tauri wrap for the Steam build) where URL/hash
 * routing fights the embedding, and players shouldn't be able to deep-link
 * into screens or break flow with the browser back button. Screens are
 * lazy-imported so the code-splitting pattern is set from the first route.
 */
export const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'garage', component: () => import('../screens/GarageScreen.vue') },
    {
      path: '/overworld',
      name: 'overworld',
      component: () => import('../screens/OverworldScreen.vue'),
    },
    {
      path: '/test-track',
      name: 'test-track',
      component: () => import('../screens/TestTrackScreen.vue'),
    },
    {
      path: '/menu',
      name: 'menu',
      component: () => import('../screens/MenuScreen.vue'),
      // The menu is a real full-screen menu, not a tab - `App.vue` hides the
      // header/nav chrome on any route with `chrome: false`.
      meta: { chrome: false },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../screens/SettingsScreen.vue'),
      // A sub-page of the pause menu, not a gameplay tab - same chrome-free
      // treatment as the menu itself.
      meta: { chrome: false },
    },
    {
      path: '/compendium',
      name: 'compendium',
      component: () => import('../screens/CompendiumScreen.vue'),
      // Reference reading reached from the pause menu, same as Settings -
      // never a gameplay tab, so it carries the same chrome-free treatment.
      meta: { chrome: false },
    },
    { path: '/car/:id', name: 'car', component: () => import('../screens/CarDetailScreen.vue') },
    {
      path: '/body-shop',
      name: 'body-shop',
      component: () => import('../screens/BodyShopScreen.vue'),
    },
    {
      path: '/auctions',
      name: 'auctions',
      component: () => import('../screens/AuctionScreen.vue'),
    },
    {
      path: '/auctions/:lotId/room',
      name: 'auction-room',
      component: () => import('../screens/AuctionRoomScreen.vue'),
    },
    { path: '/parts', name: 'parts', component: () => import('../screens/PartsMarketScreen.vue') },
    { path: '/jobs', name: 'jobs', component: () => import('../screens/ServiceJobsScreen.vue') },
    {
      path: '/upgrades',
      name: 'upgrades',
      component: () => import('../screens/UpgradesScreen.vue'),
    },
    {
      path: '/dyno',
      name: 'dyno',
      component: () => import('../screens/DynoScreen.vue'),
    },
    {
      path: '/office',
      name: 'office',
      component: () => import('../screens/OfficeScreen.vue'),
    },
    {
      path: '/staff',
      name: 'staff',
      component: () => import('../screens/StaffOfficeScreen.vue'),
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('../screens/MarketScreen.vue'),
    },
    {
      path: '/cafe',
      name: 'cafe',
      component: () => import('../screens/CafeScreen.vue'),
    },
    ...devRoutes,
  ],
})

/**
 * A drag/pick session is module-level state that outlives the component that
 * started it (`useDragAndDrop.ts`'s own header comment). Without this,
 * navigating away mid-pick (e.g. picking a part, then tapping back to the
 * garage) left a stale session alive - the next screen's Replace click would
 * silently short-circuit against a payload the user has no way to see or
 * intend anymore. A navigation always ends any in-flight pick/drag.
 */
router.afterEach(() => clearDragSession())

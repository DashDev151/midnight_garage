import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { useGameStore } from './stores/gameStore'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// Load the autosaved career (if any) before first paint, so a refresh
// resumes where you were instead of flashing a fresh game. Every session
// lands on the menu (Continue/New Game/Load), not straight into the garage -
// the router replace happens before mount so there's no flash of the garage
// screen first.
const game = useGameStore(pinia)
void game
  .hydrate()
  .then(() => router.replace({ name: 'menu' }))
  .finally(() => {
    app.mount('#app')
  })

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
// resumes where you were instead of flashing a fresh game.
const game = useGameStore(pinia)
void game.hydrate().finally(() => {
  app.mount('#app')
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'sim',
    environment: 'node',
    /**
     * Raised from Vitest's 5 s default because this suite is full of probes that
     * sweep the WHOLE roster against every course, every build grade or hundreds
     * of seeded lots, and the roster nearly doubled (26 cars to 48) when the
     * scene arc's content landed. Those probes now do roughly twice the work
     * they were written against, and under v8 coverage instrumentation the
     * slowest of them cross five seconds.
     *
     * This weakens no assertion. A timeout is a budget for how long a test may
     * take, never a claim about what it proves. Keeping the budget here rather
     * than appending a per-test timeout to each offender stops the same failure
     * resurfacing one test at a time every time a car is added.
     *
     * The budget is generous on purpose. The heaviest probes here sweep hundreds
     * of seeded lots across every campaign year and run about nine seconds on
     * their own, but a whole-repo run puts every project's workers on the same
     * cores under coverage instrumentation, and the same test can take several
     * times longer there than it does alone. A budget sized to the solo timing
     * turns that contention into an intermittent red that reproduces nowhere.
     */
    testTimeout: 90_000,
  },
})

/**
 * Every tunable the drive model owns, in one place. These are the parameters
 * the plan (`docs/design/systems/drive-mode-plan.md`, section 1b) authorises
 * drive mode to invent: yaw and steering behaviour, tyre curve shape, assists
 * and the synthetic gearbox. Everything a car physically IS comes from
 * `carBlock()` and is never restated here.
 *
 * None of these values touches money, reputation or progression, so they sit
 * outside directive 22's economy gate; they are still listed for maintainer
 * review in `docs/design/systems/drive-physics-v1.md`.
 */
export const DRIVE_CONFIG = {
  /** Fixed physics step, Hz. The plan mandates a fixed 120 Hz accumulator. */
  stepHz: 120,

  /** Bicycle-model geometry fallbacks for spec fields a model may not carry. */
  geometry: {
    /** Static front weight fraction by layout when `weightDistributionFront`
     * is absent. Era-typical road-car figures, not measurements. */
    weightFrontByLayout: { FF: 0.62, FR: 0.53, MR: 0.44, RR: 0.4, AWD: 0.56 } as const,
    /** Centre-of-mass height as a fraction of body height when `comHeightMm`
     * is absent. */
    comHeightFraction: 0.38,
    /** Body height fallback, mm. */
    heightFallbackMm: 1380,
    /** Wheelbase fallback, mm. */
    wheelbaseFallbackMm: 2500,
    /** Yaw inertia: `Izz = m * wheelbase^2 * k`. 0.28 lands a 1 tonne, 2.4 m
     * car near published saloon figures. */
    yawInertiaK: 0.28,
    /** Engine-position modifiers on yaw inertia: a mid engine concentrates
     * mass at the centre, a rear engine slightly less so. */
    yawInertiaByEngine: { front: 1.0, mid: 0.86, rear: 0.94 } as const,
  },

  /** Brush-style tyre curve (per axle, load-normalised). */
  tyre: {
    /** Slip angle (rad) at peak lateral force for the reference grip below.
     * Peak slip scales with grip, so a stickier tyre has a WIDER window
     * before letting go, which is the plan's "a better build is more
     * forgiving" made physical. */
    peakSlipBaseRad: 0.13,
    /** The grip coefficient `peakSlipBaseRad` describes. */
    referenceMu: 0.9,
    /** Fraction of peak force retained deep past the peak, before assists
     * widen it. Higher is more catchable. */
    slideRetain: 0.86,
    /** Slip-angle width (as a multiple of peak slip) over which force falls
     * from peak to the retained plateau. */
    falloffWidth: 1.6,
    /** Per-axle peak-slip balance. Rear slightly wider than front gives a
     * mild, safe limit-understeer baseline; drivetrain then differentiates
     * on top through the friction circle. */
    peakSlipBalanceFront: 1.0,
    peakSlipBalanceRear: 1.08,
    /** Longitudinal usage above which the driven or braked tyre is treated
     * as saturated (spinning or locked) and its lateral grip collapses. */
    saturationPoint: 1.0,
  },

  /** Steering feel. */
  steering: {
    /** Maximum road-wheel angle, rad (about 32 degrees). */
    lockRad: 0.56,
    /** Full-lock slew rate, rad/s, for ramped keyboard input. */
    rateRadPerS: 5.0,
    /** Return-to-centre is quicker than steering in. */
    returnRateRadPerS: 8.0,
    /** Speed-sensitive lock: the wheel is limited so the kinematic lateral
     * demand cannot exceed this multiple of available grip. Above 1 keeps
     * the limit reachable and breachable; it is the arcade "you cannot yank
     * it into a spin at speed" guard. */
    ayCapFactor: 1.18,
    /** The lock also allows this multiple of the front tyre's peak slip angle
     * on top of the kinematic need, because the wheel must point past the
     * path by the slip angle to load the tyre at all. */
    slipAllowanceFactor: 1.35,
  },

  /** Drivetrain split of drive force to the front axle. */
  driveSplitFront: { FWD: 1.0, RWD: 0.0, AWD: 0.35 } as const,

  /** Low-speed handling of the slip-angle singularity. */
  lowSpeed: {
    /** Below this speed (m/s) tyre forces blend toward a kinematic model. */
    blendBelowMs: 3.0,
    /** Denominator floor for slip-angle calculation, m/s. */
    slipFloorMs: 0.6,
    /** Lateral and yaw damping in the kinematic blend zone, 1/s. */
    dampPerS: 6.0,
  },

  /** Load-transfer response: first-order lag on longitudinal acceleration
   * standing in for suspension, s. */
  loadTransferTauS: 0.09,

  /** Driver assists at level 1. Every term scales linearly to zero. */
  assists: {
    /** Traction control: cap driven longitudinal usage at this fraction of
     * the axle budget. */
    tcCap: 0.92,
    /** ABS: cap braking usage per axle at this fraction of the budget. */
    absCap: 0.95,
    /** Stability: yaw damping toward the kinematic yaw rate, 1/s. */
    yawDampPerS: 2.2,
    /** Countersteer help: steer added against body slip beyond the dead
     * zone, rad per rad of slip. */
    counterSteerGain: 0.55,
    counterSteerDeadRad: 0.06,
    /** Extra slide retention at full assist (added to `slideRetain`). */
    retainBonus: 0.08,
  },

  /** Service brakes. */
  brakes: {
    /** The rear's share of an ideal live-load split, kept safely under 1 so
     * the rear axle retains lateral budget under braked turn-in, as period
     * proportioning valves were set. A full-pedal straight stop still lands
     * on the calibrated figure: ABS-side headroom is on the front. */
    rearBiasSafety: 0.9,
  },

  /** Handbrake (drift entry; secondary per the maintainer's steer). */
  handbrake: {
    /** Rear braking force as a fraction of the car's total braking. */
    rearForceFraction: 0.55,
    /** Rear lateral grip multiplier while held. */
    rearGripCut: 0.5,
  },

  /** Synthetic gearbox: presentation-layer physics. Net thrust is pinned to
   * the calibrated `effectivePowerW` (the envelope is normalised to mean 1
   * over a gear sweep), so it adds feel without moving lap times. */
  gearbox: {
    gearCount: 5,
    /** Road speed at redline in first gear, as a fraction of top speed,
     * bounded in m/s. */
    firstGearTopFraction: 0.17,
    firstGearMinMs: 12,
    firstGearMaxMs: 22,
    /** Top gear reaches redline just past terminal speed. */
    topGearOverrun: 1.03,
    /** Redline fallbacks by aspiration when the spec states none. */
    redlineFallback: { na: 7200, turbo: 6900, rotary: 8000 },
    idleRpm: 900,
    /** Power envelope over rpm fraction f: rises from `low` to 1 across
     * [rampStart, rampEnd] with exponent `shape`; turbo cars ramp later and
     * harder. Normalised to mean 1 in `buildGearbox`. */
    envelope: {
      na: { low: 0.42, rampStart: 0.12, rampEnd: 0.9, shape: 0.85 },
      turbo: { low: 0.3, rampStart: 0.22, rampEnd: 0.85, shape: 1.25 },
    },
    shiftUpAtF: 0.985,
    shiftDownAtF: 0.58,
    shiftCutS: 0.12,
    minGearHoldS: 0.4,
    /** Below this speed the clutch is slipping and full launch power is
     * available regardless of rpm. */
    clutchBelowMs: 4.0,
  },

  /** Road ribbon built from `courses.json` geometry. */
  track: {
    /** Centreline sample spacing, m. */
    sampleSpacingM: 2.0,
    /** Drivable half-width, m, by course id; the fallback suits a touge. */
    halfWidthDefaultM: 4.5,
    halfWidthById: { wangan: 7.5, misaki: 6.0 } as const,
    /** Grip multiplier off the tarmac. */
    offRoadGrip: 0.55,
    /** Extra rolling drag off the tarmac, m/s^2. Deliberately below the
     * weakest car's grass-grip launch force so the grass is slow, never a
     * trap a car cannot drive out of. */
    offRoadDragMs2: 1.1,
  },

  /** The scripted ghost driver used by the acceptance harness. */
  ghost: {
    /** Fraction of the theoretical limit the ghost targets on straights. */
    cleanFraction: 0.985,
    /** Corner targets carry a real margin below the apex: at 1.0 the tyre
     * must sit exactly at peak slip, so any tracking overshoot lands on the
     * unstable falloff side and becomes a steady outward drift. The margin
     * is drivetrain-aware because the failure mode is not symmetrical: a
     * front-limited car pushes wide benignly, a rear-limited car snaps. */
    cornerFractionByDrivetrain: { FWD: 0.94, AWD: 0.92, RWD: 0.9 } as const,
    /** Rejoin (latched, hysteresis): well off the line, racing logic slaloms
     * unstably back to the track, so the ghost drives to the line gently at a
     * long lookahead and a modest speed instead, then races again. */
    rejoin: { enterLatM: 3, exitLatM: 1.2, speedMs: 11, throttleCap: 0.55 },
    /** Curvature preview distance: `gain * v`, clamped, m. */
    previewGainS: 0.4,
    previewMinM: 3,
    previewMaxM: 14,
    /** Closed-loop path gains: position and rate act as curvature per m/s^2
     * of wanted lateral correction; heading as a lateral rate. */
    track2: { latGain: 1.0, rateGain: 1.8, headGain: 0.9, yawGain: 0.8, posAyFrac: 0.55, headAyFrac: 0.4, yawAyFrac: 0.5 },
    /** Braking decision margin over the allowed-now speed. */
    brakeTriggerRatio: 1.0,
    /** Margin on the friction-circle braking budget the speed plan assumes,
     * covering controller tracking error. The plan already deducts each
     * station's cornering spend before braking with the remainder. */
    brakePlanFraction: 0.78,
    /** Mid-corner throttle eases with steering so the driven axle keeps some
     * lateral budget. */
    throttleSteerCut: 0.8,
    /** Brake squeeze lag, s: onset ramps, release is instant. */
    brakeTauS: 0.15,
    /** First-order lag on the ghost's steer command, s. A stepped wheel at
     * corner speed blows the front tyre far past peak slip and the car
     * over-rotates; a driver feeds the lock in. */
    steerTauS: 0.1,
    /** The ghost leaves the last slither of lock alone. */
    steerMax: 0.92,
    /** Above this front-axle saturation the ghost unwinds the wheel toward
     * peak instead of adding lock: past the peak, more angle is less force. */
    frontSlipUnwindAt: 1.15,
    /** Proportional throttle/brake gains on speed error, 1/(m/s). */
    throttleGain: 0.55,
    brakeGain: 0.9,
  },
} as const

export type DriveConfig = typeof DRIVE_CONFIG

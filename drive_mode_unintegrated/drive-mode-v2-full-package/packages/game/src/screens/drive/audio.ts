/** Fully procedural sound stage for the drive mode: no samples.
 * Engine: three detuned oscillators at firing frequency behind a
 * load-driven lowpass. Tyres: resonant band-passed noise. Wind:
 * speed-driven lowpass noise. Night: LFO-chirped narrowband crickets.
 * Sodium hum under lamps; slow swelling waves on the coast.
 * Pure target mapping lives in computeMixTargets so it can be tested
 * without an AudioContext. */

export interface MixInputs {
  rpm: number
  load: number
  speedMs: number
  slide: number
  lampDistM: number
  zoneKind: number
}

export interface MixTargets {
  engineHz: number
  engineFilterHz: number
  engineGain: number
  exhaustLpHz: number
  exhaustGain: number
  screechGain: number
  screechGain2: number
  screechHz: number
  windHz: number
  windGain: number
  cricketGain: number
  humGain: number
  waveGain: number
  waveLfoDepth: number
}

export function computeMixTargets(i: MixInputs): MixTargets {
  const f0 = Math.max(26, i.rpm / 30)
  const wN = Math.min(1, i.speedMs / 58)
  const wMul = i.zoneKind === 4 ? 1.5 : 1
  const cricketBase =
    (i.zoneKind === 1 ? 0.02 : i.zoneKind === 2 ? 0.006 : i.zoneKind === 3 ? 0.008 : i.zoneKind === 4 ? 0.002 : 0.012) *
    (1 - wN * 0.7)
  const coast = i.zoneKind === 3
  return {
    engineHz: f0,
    engineFilterHz: 600 + i.load * 3800 + i.speedMs * 8,
    engineGain: 0.085 + i.load * 0.12,
    exhaustLpHz: Math.min(420, 90 + f0 * 0.9),
    exhaustGain: 0.05 + i.load * 0.1,
    screechGain: i.slide * 0.5,
    screechGain2: i.slide * 0.16,
    screechHz: 950 + i.speedMs * 8,
    windHz: 250 + wN * wN * 1900,
    windGain: wN * wN * 0.18 * wMul,
    cricketGain: cricketBase,
    humGain: i.lampDistM < 24 ? Math.pow(1 - i.lampDistM / 24, 2) * 0.05 : 0,
    waveGain: coast ? 0.05 : 0,
    waveLfoDepth: coast ? 0.028 : 0,
  }
}

interface EngineOsc {
  o: OscillatorNode
  mul: number
}

/* Engine voices, from engine-order acoustics: harmonics sit at
 * half-integer multiples of crank speed, the dominant order is
 * cylinders/2, and character lives in which orders carry energy.
 * Our f0 equals the inline-4 firing frequency, so multipliers below
 * are in firing orders of a four. */
export interface EngineVoice {
  mults: readonly number[]
  gains: readonly number[]
  /** Extra gain on the top two orders scaled by rpm fraction: the
   * VTEC brightening. */
  hiRise: number
  am: number
  exFreqBase: number
  exGain: number
  subGain: number
  turbo: boolean
}

const VOICES: Record<string, EngineVoice> = {
  // 4A-GE on ITBs: dominant order 2 with rough, audible half-orders
  // and plenty of exhaust bark; lumpy amplitude modulation.
  'toyota-sprinter-trueno-ae86': { mults: [0.5, 1, 1.5, 2, 3, 4], gains: [0.32, 1, 0.42, 0.66, 0.28, 0.16], hiRise: 0.15, am: 0.5, exFreqBase: 760, exGain: 0.085, subGain: 0.5, turbo: false },
  // B16A VTEC: clean integer orders that BRIGHTEN as the cam comes
  // in; tidier exhaust, screaming top end.
  'honda-civic-sir2-eg6': { mults: [1, 2, 3, 4, 5, 6], gains: [1, 0.6, 0.34, 0.22, 0.13, 0.08], hiRise: 0.85, am: 0.3, exFreqBase: 620, exGain: 0.055, subGain: 0.42, turbo: false },
  // RB26 straight-six turbo: dominant order 3 (1.5x the four), even
  // and creamy, low modulation, deep sub, broadband boost hiss.
  'nissan-skyline-gtr-bnr32': { mults: [0.75, 1.5, 3, 4.5, 6, 7.5], gains: [0.3, 1, 0.52, 0.28, 0.15, 0.08], hiRise: 0.25, am: 0.15, exFreqBase: 480, exGain: 0.05, subGain: 0.62, turbo: true },
}

const DEFAULT_VOICE: EngineVoice = VOICES['toyota-sprinter-trueno-ae86']!

export function voiceFor(carId: string): EngineVoice {
  return VOICES[carId] ?? DEFAULT_VOICE
}

export class DriveAudio {
  private ctx: AudioContext | null = null
  private enabled = true
  private slide = 0
  private master!: GainNode
  private tyP: StereoPannerNode | null = null
  private voice: EngineVoice = DEFAULT_VOICE
  private oscGains: GainNode[] = []
  private tbG: GainNode | null = null
  setVoice(carId: string): void {
    this.voice = voiceFor(carId)
    this.applyVoice()
  }
  private applyVoice(): void {
    if (!this.ctx) return
    const v = this.voice
    for (let i = 0; i < this.oscGains.length; i++) {
      this.oscGains[i]!.gain.value = (v.gains[i] ?? 0) * 0.16
    }
  }
  private rnG: GainNode | null = null
  private rwG: GainNode | null = null
  private osc: EngineOsc[] = []
  private engF!: BiquadFilterNode
  private engG!: GainNode
  private exF!: BiquadFilterNode
  private exMod!: OscillatorNode
  private exAmG: GainNode | null = null
  private exG!: GainNode
  private scG!: GainNode
  private scG2!: GainNode
  private scB!: BiquadFilterNode
  private wf!: BiquadFilterNode
  private wg!: GainNode
  private cg!: GainNode
  private cld!: GainNode
  private hg!: GainNode
  private vg!: GainNode
  private vld!: GainNode

  /** Must be called from a user gesture; safe to call repeatedly.
   * Also resumes a suspended context: iOS starts contexts suspended
   * and only honours resume() from gestures like touchend or click. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume()
      return
    }
    if (!this.enabled) return
    const C = new AudioContext()
    if (C.state !== 'running') void C.resume()
    this.ctx = C
    const master = C.createGain()
    master.gain.value = 0
    // Master limiter: gentle, fast, the standard guard against clip
    // when engine, tyres, wind and ambience stack.
    const comp = C.createDynamicsCompressor()
    comp.threshold.value = -8
    comp.knee.value = 4
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.25
    master.connect(comp)
    comp.connect(C.destination)
    this.master = master
    const nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate)
    const nd = nb.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
    const noiseSrc = (): AudioBufferSourceNode => {
      const src = C.createBufferSource()
      src.buffer = nb
      src.loop = true
      src.start()
      return src
    }
    const engF = C.createBiquadFilter()
    engF.type = 'lowpass'
    engF.frequency.value = 900
    engF.Q.value = 0.8
    const engG = C.createGain()
    engG.gain.value = 0.11
    engF.connect(engG)
    engG.connect(master)
    // A wider voice: sub-octave triangle thump, detuned saw pair for
    // thickness, half-order saw, a whisper of square rasp.
    // Six voices at the engine orders of the current car: the first
    // two orders as saws (rich), the rest as sines. Gains are owned
    // by the voice profile and retuned on setVoice.
    this.oscGains = []
    for (let i = 0; i < 6; i++) {
      const o = C.createOscillator()
      o.type = i < 2 ? 'sawtooth' : 'sine'
      const og = C.createGain()
      og.gain.value = (this.voice.gains[i] ?? 0) * 0.16
      o.connect(og)
      og.connect(engF)
      o.start()
      this.osc.push({ o, mul: this.voice.mults[i] ?? 1 })
      this.oscGains.push(og)
    }
    const rl = C.createOscillator()
    rl.frequency.value = 31
    const rg = C.createGain()
    rg.gain.value = 55
    rl.connect(rg)
    rg.connect(engF.frequency)
    rl.start()
    this.engF = engF
    this.engG = engG
    // Exhaust rumble: lowpassed noise amplitude-modulated at the
    // firing frequency, so the engine breathes instead of buzzing.
    const ex = noiseSrc()
    const exF = C.createBiquadFilter()
    exF.type = 'lowpass'
    exF.frequency.value = 160
    exF.Q.value = 0.7
    const exAM = C.createGain()
    exAM.gain.value = 0.55
    const exMod = C.createOscillator()
    exMod.frequency.value = 30
    const exModG = C.createGain()
    exModG.gain.value = this.voice.am
    this.exAmG = exModG
    exMod.connect(exModG)
    exModG.connect(exAM.gain)
    exMod.start()
    const exG = C.createGain()
    exG.gain.value = 0.06
    ex.connect(exF)
    exF.connect(exAM)
    exAM.connect(exG)
    exG.connect(engF)
    this.exF = exF
    this.exMod = exMod
    this.exG = exG
    // RAIN: broadband patter (bandpassed) over a low wash.
    const rn = noiseSrc()
    const rnB = C.createBiquadFilter()
    rnB.type = 'bandpass'
    rnB.frequency.value = 2600
    rnB.Q.value = 0.45
    const rnG = C.createGain()
    rnG.gain.value = 0
    rn.connect(rnB)
    rnB.connect(rnG)
    rnG.connect(master)
    const rw = noiseSrc()
    const rwF = C.createBiquadFilter()
    rwF.type = 'lowpass'
    rwF.frequency.value = 420
    const rwG = C.createGain()
    rwG.gain.value = 0
    rw.connect(rwF)
    rwF.connect(rwG)
    rwG.connect(master)
    this.rnG = rnG
    this.rwG = rwG
    // Turbo: broadband boost hiss, alive only on turbo voices.
    const tb = noiseSrc()
    const tbF = C.createBiquadFilter()
    tbF.type = 'highpass'
    tbF.frequency.value = 3200
    const tbG = C.createGain()
    tbG.gain.value = 0
    tb.connect(tbF)
    tbF.connect(tbG)
    tbG.connect(master)
    this.tbG = tbG
    this.applyVoice()
    const sc = noiseSrc()
    const scB = C.createBiquadFilter()
    scB.type = 'bandpass'
    scB.frequency.value = 1150
    scB.Q.value = 5.5
    const scB2 = C.createBiquadFilter()
    scB2.type = 'bandpass'
    scB2.frequency.value = 2500
    scB2.Q.value = 9
    const scG = C.createGain()
    scG.gain.value = 0
    const scG2 = C.createGain()
    scG2.gain.value = 0
    sc.connect(scB)
    scB.connect(scG)
    const tyP = C.createStereoPanner ? C.createStereoPanner() : null
    if (tyP) tyP.connect(master)
    this.tyP = tyP
    scG.connect(tyP ?? master)
    sc.connect(scB2)
    scB2.connect(scG2)
    scG2.connect(tyP ?? master)
    this.scG = scG
    this.scG2 = scG2
    this.scB = scB
    const wn = noiseSrc()
    const wf = C.createBiquadFilter()
    wf.type = 'lowpass'
    wf.frequency.value = 280
    wf.Q.value = 0.4
    const wg = C.createGain()
    wg.gain.value = 0
    wn.connect(wf)
    wf.connect(wg)
    wg.connect(master)
    this.wf = wf
    this.wg = wg
    const cn = noiseSrc()
    const cb = C.createBiquadFilter()
    cb.type = 'bandpass'
    cb.frequency.value = 4300
    cb.Q.value = 14
    const cg = C.createGain()
    cg.gain.value = 0
    cn.connect(cb)
    cb.connect(cg)
    cg.connect(master)
    const clfo = C.createOscillator()
    clfo.frequency.value = 23
    const cld = C.createGain()
    cld.gain.value = 0
    clfo.connect(cld)
    cld.connect(cg.gain)
    clfo.start()
    const cwob = C.createOscillator()
    cwob.frequency.value = 0.13
    const cwg = C.createGain()
    cwg.gain.value = 7
    cwob.connect(cwg)
    cwg.connect(clfo.frequency)
    cwob.start()
    this.cg = cg
    this.cld = cld
    const h1 = C.createOscillator()
    h1.type = 'sine'
    h1.frequency.value = 100
    const h2 = C.createOscillator()
    h2.type = 'triangle'
    h2.frequency.value = 200
    const hg = C.createGain()
    hg.gain.value = 0
    const hmix = C.createGain()
    hmix.gain.value = 0.35
    h1.connect(hg)
    h2.connect(hmix)
    hmix.connect(hg)
    hg.connect(master)
    h1.start()
    h2.start()
    this.hg = hg
    const vn = noiseSrc()
    const vf = C.createBiquadFilter()
    vf.type = 'lowpass'
    vf.frequency.value = 420
    const vg = C.createGain()
    vg.gain.value = 0
    vn.connect(vf)
    vf.connect(vg)
    vg.connect(master)
    const vlfo = C.createOscillator()
    vlfo.frequency.value = 0.12
    const vld = C.createGain()
    vld.gain.value = 0
    vlfo.connect(vld)
    vld.connect(vg.gain)
    vlfo.start()
    this.vg = vg
    this.vld = vld
    master.gain.setTargetAtTime(0.85, C.currentTime, 0.5)
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.15)
  }

  isEnabled(): boolean {
    return this.enabled
  }

  update(dtS: number, rpm: number, load: number, speedMs: number, sliding: boolean, lampDistM: number, zoneKind: number, latMs = 0, wet = 0): void {
    if (!this.ctx) return
    const C = this.ctx
    const t = C.currentTime
    const T = (p: AudioParam, v: number, tc: number): void => {
      p.setTargetAtTime(v, t, tc)
    }
    this.slide += ((sliding ? Math.min(1, 0.25 + speedMs / 30) : 0) - this.slide) * Math.min(1, dtS / 0.18)
    const m = computeMixTargets({ rpm, load, speedMs, slide: this.slide, lampDistM, zoneKind })
    const v = this.voice
    const rpmFrac = Math.min(1, rpm / 8200)
    for (let i = 0; i < this.osc.length; i++) {
      const os = this.osc[i]!
      T(os.o.frequency, m.engineHz * (v.mults[i] ?? os.mul), 0.03)
      if (i >= 4 && this.oscGains[i]) {
        // VTEC brightening: the top orders rise with rpm.
        T(this.oscGains[i]!.gain, (v.gains[i] ?? 0) * 0.16 * (1 + v.hiRise * rpmFrac * 3), 0.12)
      }
    }
    if (this.tbG) T(this.tbG.gain, v.turbo ? load * rpmFrac * 0.09 : 0, 0.2)
    // The master ramp lives HERE, every frame: whatever state the
    // toggle or the unlock dance left things in, audio converges.
    T(this.master.gain, this.enabled ? 0.85 : 0, 0.25)
    if (this.tyP) T(this.tyP.pan, Math.max(-0.6, Math.min(0.6, latMs / 6)), 0.12)
    if (this.rnG) T(this.rnG.gain, wet * 0.075, 0.6)
    if (this.rwG) T(this.rwG.gain, wet * 0.05, 0.8)
    T(this.engF.frequency, m.engineFilterHz, 0.08)
    T(this.engG.gain, m.engineGain, 0.1)
    T(this.exF.frequency, this.voice.exFreqBase + load * 2600, 0.08)
    T(this.exMod.frequency, m.engineHz, 0.03)
    // Voice character: AM depth (lumpy ITBs vs silky six) and the
    // exhaust level itself.
    T(this.exG.gain, this.voice.exGain * (0.5 + load * 0.9), 0.12)
    if (this.exAmG) T(this.exAmG.gain, this.voice.am, 0.2)
    T(this.exG.gain, m.exhaustGain, 0.1)
    T(this.scG.gain, m.screechGain, 0.05)
    T(this.scG2.gain, m.screechGain2, 0.05)
    T(this.scB.frequency, m.screechHz, 0.1)
    T(this.wf.frequency, m.windHz, 0.2)
    T(this.wg.gain, m.windGain, 0.2)
    T(this.cg.gain, m.cricketGain, 0.5)
    T(this.cld.gain, m.cricketGain * 0.85, 0.5)
    T(this.hg.gain, m.humGain, 0.12)
    T(this.vg.gain, m.waveGain, 0.8)
    T(this.vld.gain, m.waveLfoDepth, 0.8)
  }

  dispose(): void {
    if (this.ctx) void this.ctx.close()
    this.ctx = null
  }
}

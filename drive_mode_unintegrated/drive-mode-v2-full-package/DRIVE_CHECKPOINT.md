# Drive physics worklog and checkpoint

Purpose: if this session is interrupted, a fresh session resumes from this
file. Prior transcript:
/mnt/transcripts/2026-08-07-20-09-13-midnight-garage-drive-physics.txt
Repo: /home/claude/midnight_garage (uncommitted work; commits need approval).
Snapshot archives land in /mnt/user-data/outputs (drive-work-*.tar.gz).

## House rules (binding: code, comments, chat)
No em dashes (U+2014) anywhere; guard test exists. British English. No
emojis. Tests in packages/sim/tests/. `arr[i]!` under noUncheckedIndexedAccess.
No new deps, no background processes, narrowest checks once (typecheck fine
for new symbols). git reset/force/rebase/clean forbidden. Drive mode never
touches money, reputation or progression. Content imports come from
'@midnight-garage/content'.

## Architecture on disk (packages/sim/src/drive/)
config.ts gearbox.ts tyre.ts params.ts physics.ts track.ts ghost.ts index.ts
plus src/index.ts export and performance.ts exporting apexSpeed and vTopOf.
Tests: tests/driveTrack.test.ts (PASSES), tests/drivePhysics.test.ts
(passes as of last run), tests/driveGhost.test.ts (acceptance, 9 cases,
band 0.96..1.07, currently failing), tests/_ghostDebug.test.ts (TEMPORARY
hakone/civic probe; DELETE before finishing).

## Controller decisions that took real debugging (do not regress)
- steerLockFor(params, v, muLat) = min(mechanical, kinematic-for-ayCap +
  slipAllowanceFactor * peakSlipPerMuFront * muLat). Exported from physics.
- GHOST STEERS BY CURVATURE, not angle: pursuitKappa = 2 sin(alpha)/dist;
  wanted delta = atan(kappa * wheelbase) + slipFF - trim, where slipFF =
  latFrac * peakSlipF * muLat and latFrac = clamp(v^2 kappa / (mu g)).
  Commanding angle against a slip-padded lock maps input to slip at speed
  and the ghost WEAVES ITSELF INTO A SPIN on straights.
- Anti-saturation applied at OUTPUT (steer = steerFilt * unwind), unwind =
  max(0.35, unwindAt/frontSlip) when frontSlip > unwindAt.
- Speed plan: corner samples cornerFraction (0.94) * apexSpeed(cornerMu...),
  straights cleanFraction (0.985) * vMax; backward circular pass x2 is
  FRICTION-CIRCLE AWARE: aLong = brakePlanFraction * sqrt(max(0, budget^2 -
  (vNext^2 kNext)^2)), floor 0.4, budget = brakeMu * aeroMult(vNext) * g.
- Braking is FED FORWARD from plan gradient over horizon clamp(0.8 v, 5, 26)
  plus P term brakeGain on (vHere - v); squeezed through one-way lag
  brakeTauS (instant release). NO steering-based pedal cap (the plan is
  already circle-aware; capping again makes arrivals hot).
- physics.ts: one-sided yaw damper (bleeds excess |yaw| beyond min(|rKin|,
  1.05 rGripCap), never adds rotation: two-sided spun cars up in hairpins).
- physics.ts: rear brake share = ideal * brakes.rearBiasSafety (0.9): ideal
  rear bias has zero lateral budget and slides at every braked turn-in.
- Ghost modes, all latched: uTurn (enter |alpha|>2.4 and v<8, exit
  |alpha|<0.7 or v>14; steer full toward alpha, throttle 0.5); rejoin (enter
  |lat|>3 and not sliding, exit |lat|<1.2; lookahead >= 15, vTarget <= 11,
  throttleCap 0.55); slide gate (|vLat|/v > 0.3 and v>5: brake <= 0.15,
  throttle 0, and blocks rejoin ENTRY).
- offRoadDragMs2 1.1 (was 2.5, an inescapable trap: drag must sit below the
  weakest car's grass-grip launch force).
- Track: buildTrack(course, laps), alternating signs starting right;
  locateOnTrack(hint); wrapPose rigid transform. Hakone lapLength 2700 m,
  hairpins r=11 near stations 385, 1222-1256, ~1930; twisty S run ~1975-2450.

## SESSION END STATE 18 (read this first on resume)
SESSION END STATE 27 (v16.7): HANDOVER PREPARED. User satisfied
with progress; testing paused. Deliverable: docs/handover/
drive-mode-v2-integration.md - full integration handover for the
dev/LLM agent: background + pillars, file map, architecture (window
stream, fixed loop, mood/fx contracts, driveParamsForInstance
mapping law), PHASE 1 = dev-gated entry with the 3 tested cars via
stock mint instances (arcadeSetup pattern lifted behind
route.query.dev + import.meta.env.DEV; no player nav), PHASE 2 =
overworld road element TOP-LEFT adjacent to the touge/test-track
element -> /drive with any drivable owned car (UI direction
pending; build nothing speculative), the OPEN mileage decision
(product owner only), full trap list (build discipline, contracts,
physics pins, runtime, LLM scripted-edit law), verification
commands, state numbers. Route /drive already exists (router
index 71); OverworldScreen.vue is the phase-2 home; no formal dev
panel exists - handover says adapt. Tarball rebuilt WITH handover.
Session closes green: 1079 tests, tc clean, artifact generated
from repo, no commits ever made.
SESSION END STATE 26 AMENDED 4 (v16.6d): steering research done.
USER challenged: did you research the steering or just take my 0.5 s?
HONEST: 0.5 s was the user proposal (implemented as the requested
experiment); speed-lock + asymmetric return were domain knowledge,
NOT freshly researched. Research NOW done and reported: speed
sensitivity is the canonical named mechanism (AC ~25 percent, LMU
0.6->0.3 to reduce twitch); asymmetric return SHIPS in LMU
(Return Rate Multiplier 1.4; ours 2.25x, justified for keyboard
self-centre); 0.5 s ramp sits in the community band between full
twitchy and input lag. GAP FOUND BY RESEARCH: input LINEARITY curve
on the analogue path (F1 25 guides 20-40) - added: touch steer
expo |f|^1.5 in BOTH hosts. LESSON: when the user commissions
research-backed feel work, do the search pass FIRST and say which
parts are user-spec vs literature vs judgement.
SESSION END STATE 26 AMENDED 3 (v16.6c): steering feel + FWD truth.
USER: steering instant-to-lock feels twitchy then robotic (on rails
with drift pasted on); wants ~0.5 s ramp experiment. Wind too loud.
Grip/Drift chip stuck on GRIP. FWD full-oversteers at 80 km/h.
STEERING (arcadePhysics): old 3.4/s symmetric slew = full lock in
0.18 s at ANY speed. New: ASYMMETRIC slew (toward lock 2.0/s ~ full
travel 0.5 s; back to centre 4.5/s ~ 0.22 s, movingOut test on sign
+ magnitude) + SPEED-SENSITIVE LOCK speedScale = 1/(1+(v/22)^1.7
*0.75) applied to the INPUT term only - counter-steer assist keeps
full authority. Measured: t90 0.42 s @5 km/h, 0.49 s @80; effective
lock 0.53 -> 0.347 rad.
FWD ROOT CAUSE: the lift-off derate keyed on axFilteredMs2 DECEL
with brake<0.25 - at speed, DRAG alone kept the rear narrowed 35%+
in every fast corner = standing oversteer. NOW a true TRANSIENT:
state.prevThrottle/liftPulse (armed when throttle >0.5 -> <0.15,
linear decay 0.7 s), derate 0.30*pulse*latDemandN, FWD only.
Measured: moderate 80 km/h arc betaPk 0.145 rad, slidSteps 0
(understeerer, as reality demands); lift nudge yaw 0.68 -> 0.93.
PINS: lift-off pin re-cut to transient semantics (>1.12x nudge,
<1.6 cap); NEW pin: FWD steady 80 arc beta<0.22, slid<30. ABS/trail
pins unaffected (inequality margins held).
WIND: gain 0.34 -> 0.18. STATE CHIP: shell never wired #state -
now textContent GRIP/DRIFT + .drift class per template CSS.
Probe methodology: temp it-block INSIDE arcadePhysics.test.ts
(fixtures live there; a standalone probe file could not import the
local arcadeSetup). Suite 1079, tc green, artifact rebuilt.
Deeper handling architecture critique still desktop-session scope.
SESSION END STATE 26 AMENDED 2 (v16.6b): floating orbs.
USER screenshot: big translucent orbs floating over a LOOKOUT rest
stop. CAUSE: the rest-stop bloom accents (canopy/sign/vending glow
fans) predate the layout variants - they rendered structure glow at
stops whose structures do not exist, and the assembly was DUPLICATED
in screen and shell. FIX: restStopAccents(road, station) exported
from webglRenderer with its own station sampler - variant-aware
(kind 0 canopy+sign+vending, kind 2 sign+vending, kind 1 lookout =
NO bloom, dark and quiet on purpose); both hosts now one-line call
it. Bloom draw softened: nested double fan (r and 0.55r at 0.6 col)
kills the octagon silhouette. LESSON: any post-hoc effect keyed to a
generator feature must consume the SAME descriptor (kind and all),
never re-derive a partial one; and effect assembly belongs in the
shared module the moment a second host exists. tc + 580 screens
green; artifact rebuilt.
SESSION END STATE 26 AMENDED (v16.6a): first generated-artifact
field bug. USER: tune chip dead. CAUSE: template CSS shows the sheet
via .open; the shell toggled .on - a class-state CONTRACT mismatch
introduced in transcription. FIX: one line in shell.ts, rebuild,
done - the single-codebase pipeline working as designed. LESSON:
when writing a host against a template, grep the CSS state class
for EVERY element you toggle (.open vs .on vs .show); the DOM id
existing does not mean the state contract matches. Audited the
rest: card/pauseOv/hintOv/flash/hbrake all match.
SESSION END STATE 26 (v16.6): the single-codebase turn.
USER approved: session UX (minimal), all content except photo mode,
per-car engine voices (with web research), single codebase +
buildscript. User handles game integration.
RESEARCH: engine orders - harmonics at half-integer crank orders,
dominant = cylinders/2; inline-4 rough half-orders vs straight-six
smooth order 3; turbo = broadband hiss with load.
SHIPPED (repo, all single-source now):
- driveWorld.ts extracted (TOD/todNow, RainMachine, TrafficMachine
  with per-spawn kind, SmokePool, DriftStats, seed<->code) + 5 tests;
  DriveScreen fully adopted it.
- audio.ts VOICES map keyed by model id (ae86/eg6/r32 profiles:
  mults, gains, hiRise VTEC brightening on top 2 orders, am depth,
  exFreqBase+load*2600, exGain, subGain, turbo hiss bus highpass
  3200 gain load*rpmFrac*0.09); 6-osc bank voice-driven (2 saw + 4
  sine, gains x0.16); screen calls setVoice(modelId).
- Session UX: pause overlay extended (Resume/PC-Touch/sky/rain/NEW
  camera row/hint line/End drive), visibilitychange auto-pause,
  first-run hint (dismiss on keydown), KeyC camera cycle, camMode
  0-2 Chase(9,4.2,8,1.1)/Hood(2.1,1.4,26,1.2)/Far(14.5,6.6,10,1.5)
  riding in renderer fx {camBack,camH,camAhead,camLookH}.
- Route codes: setup input drive-route-code, codeToSeed on start,
  Route {{code}} on summary.
- Rest-stop variants: restStopAt returns kind (hash 0x6e5 *3):
  0 full, 1 lookout (parapet at lat 8.6, no canopy/shop/sign),
  2 konbini (shop+sign, no canopy/pumps). Scope leak fixed (cpLat
  -> literal in lights.push).
- Traffic tri-tone: trafBufs[3] grey/blue/red, draw by kind%len;
  TrafficMachine.car.kind; screen passes kind.
- Torii: hash 0x715<0.12 in kinds 1|2, pillars lat 6.2/10.2 side
  hash, kasagi wider than span + black cap + nuki + base uplights.
- SINGLE CODEBASE: standalone/shell.ts (thin vanilla host importing
  the real modules; PC+touch schemes, chips, pause, hint, card,
  tune sheet bound to the 5 ArcadeTune fields, hbrake via
  .btn.hbrake, chunk counting for newRoad) + standalone/cars.ts
  (typed from dump; no JSON compiler flags) + tools/artifact/
  template.html (from the proven artifact + pause/hint/route
  markup) + scripts/buildArtifact.mjs (vite JS API lib iife,
  configFile false, stitch at /*__BUNDLE__*/). pnpm build:artifact
  -> dist-artifact/midnight-roads.html (1 MiB unminified, zero Vue,
  node --check clean) -> published as midnight-roads-v15.html.
  SHELL-vs-SCREEN DRIFT CAUGHT BY TC: surfaceAtLateral(lateralM,
  offRoadCfg) 2-arg, waterHazardAt(zone,lateralM), reset at
  |lat|>24, and an interleaved-pass fx field ACCENTS (rest-stop
  bloom: canopy 5.2 warm, sign 2 red, vending 1.5 blue) mirrored in.
DISASTER + STANDING RULE (both hit this turn): the tuple-comma bug
(trailing comma after a triple-quoted string) struck TWICE; the
second time open(p,'w') TRUNCATED webglRenderer.ts to 0 bytes
before .write(tuple) threw. Recovered from the tarball + replay.
RULE: every scripted write goes through safe_write(path, content)
which asserts isinstance(str) and sane length BEFORE opening 'w'.
Suite 1078 green (88 files), tc green, NO commits.
SESSION END STATE 25 AMENDED (v16.5a): fascia flicker.
USER: canopy light bands extremely flickery. ROOT CAUSE: emiBoth
emitted TWIN quads at IDENTICAL coordinates (reversed winding only)
- the twins z-fight each other, and the fascia bands additionally
sat exactly on the fascia wall plane. FIX (one function, no caller
edits, both stacks): emiBoth computes its own face normal via the
cross product and separates the twins +-0.035 m along it - the
outward copy sits proud of any wall, the inward copy hides behind.
Forecourt light pool raised 0.006 -> 0.012 over the apron for depth
margin. IDIOM RULE: never emit coplanar reversed twins; a double-
sided emissive is TWO OFFSET single-sided quads. Suite 1073, tc
green.
SESSION END STATE 25 (v16.5): rest stop as the showstopper.
USER: rest stop must look amazing pre-art; then add saturated
illuminated accents (yellows/reds/greens), iterate on the rasteriser.
V2 DIORAMA (both stacks): canopy = 4 thick posts + THICK roof slab
with dark fascia + full-perimeter emissive bands; bright underside;
forecourt LIGHT POOL quad on the tarmac; pump islands (raised kerb +
red kerb glow strip + red pump bodies + green price screens); kiosk
with overhang roof, wide lit shopfront, door, green stripe tag;
THREE vending machines (blue/red/green fronts) - the roadside icons;
sign = short pole + DOUBLE-SIDED two-band totem; 4 marked bays +
hash-gated parked car WITH wheels; 2 chunk lights.
COLOURS: fuel brand = red [0.98,0.12,0.07] on yellow [1.0,0.90,0.42]
fascia; totem red [0.96,0.10,0.06] over yellow [0.98,0.84,0.28];
konbini green tag [0.16,0.92,0.38]; screens [0.35,0.9,0.5].
Renders preview-restA..E: approach reads as a lit service-station
beacon against the night. emiBoth (twin reversed quads) = the
double-sided-emissive idiom; boxOn = road-frame box idiom.
INTERLEAVED-TURN LESSON: a user message can land mid-flow - a v2
transcription + colour pass already existed before my duplicate
attempt; anchor-throws are the tell; DIFF-BY-MARKER (accent-by-
accent grep table) is the fast reconciliation. Suite 1073, tc green.
SESSION END STATE 24 (v16.4): ABS, sense of speed, haze, rest stops.
USER findings: AWD slippery/twitchy + robotic steering (DEFERRED to
a desktop physics session per user); needs ABS for binary keyboard
brakes; fog ugly; wants rest stops; wants subtle camera speed feel +
maybe motion blur.
ABS ANSWER GIVEN: does NOT break the grip model - it forbids brake
demand from consuming the whole circle (front cap 0.86, rear 0.92,
decoupled from the assist knob which had it at 0.995=off). Measured:
71 deg turn-in under FULL binary brake, yaw 1.04, still stopping
hard. All braking pins re-run green. Pinned as a repo test.
CAMERA: camLag spring (axF*0.085, clamp -0.55..0.8, tau 0.28) on the
follow distance + FOV 62->71 deg by speed/52 (tau 0.5) + post-pass
radial edge smear (3-tap toward centre, max 0.24 mix, uSpd=speed/50).
HAZE replaces smoothstep fog: f=(1-exp(-(d-0.55*fogN)*1.35/fogN))
* mix(0.55,1,exp(-(z-camZ+2)*0.045)), capped 0.88; uCamZ uniform.
REST STOPS: restStopAt(road,s) cell 1900 m hash<0.30, land side on
coasts; apron quad, 4-post canopy + emissive underside + pumps,
kiosk + lit shopfront band, 6.2 m red sign, hash-gated parked car,
sodium light into chunk lights (REPO FIELD NAMES xM/yM/zM - the
artifact uses x/y/z; bit me once). Trees suppressed within flank 18
on the stop side; village houses suppressed in the span. Renders
verified (preview-rest2.png). Golden road test UNAFFECTED (mesh
only). Suite 1073, tc green after the field-name fix.
SESSION END STATE 23 AMENDED 4 (v16.3d): control schemes.
USER: two schemes, PC DEFAULT (WASD/arrows pedals+steer, Space
handbrake, direct hold-W throttle, slider DISABLED, touch hidden,
toggle via debug chip); physics issue pending - test after.
DISCOVERY WHILE READING: in the old combined path, holding W fought
the cruise - slider at rest means target 0, so err<-2.5 above ~9
km/h engaged the 0.35 trim brake CONSTANTLY under keyboard throttle
(hidden brake drag + EBD/ESC side effects). Strong candidate for the
user-felt physics issue; impossible in the new PC path.
PC scheme both stacks: controlMode default pc; direct pedal ramps
(thr tau 0.10, brk 0.12); S at standstill = reverse (classic); Space
handbrake; cruise/speedTargetControl fully bypassed; kSteer +-1 into
the existing 3.4/s slew. Touch mode = the previous behaviour intact.
UI: artifact #pad display none in pc + ctlChip PC/Touch
(applyControlUi at boot); repo v-show on .pad + data-test
drive-controls chip. NOTE: default pc means the PHONE needs one chip
tap for touch - per explicit user instruction. 574 + tc green.
SESSION END STATE 23 AMENDED 3 (v16.3c): rain falls like rain.
USER: rain fell in ~1 s pulses - blankets with gaps. ROOT CAUSE: the
streak field re-rolled its per-drop hash every 1/3 s (seed included
Math.floor(tnow*3)) AND all drops shared one 0.75 s modulo wrap ->
phases collapsed into synchronised curtains. FIX (both stacks): each
drop keeps a STABLE hash/speed/phase; position re-rolls ONLY at its
own wrap instant (cycle index in the hash seed); per-drop speed
11-16 m/s over a 10 m span; first/last metre alpha fade hides wraps;
slight backward slant. PARTICLE LESSON: never put quantised time in
a particle identity hash, and never share a wrap phase across a
field - stable identity + per-particle cycle keys give continuity.
PROCESS: a trailing comma in the heredoc made old a tuple; the repo
write silently did not happen while tc/tests ran green on the
UNCHANGED file - the assert-verify-after-write habit caught it on
the redo. tc green.
SESSION END STATE 23 AMENDED 2 (v16.3b): rain visibility + Japan.
USER: rain toggle does nothing; oncoming traffic on the WRONG side
(Japan keeps left). DIAGNOSIS 1: ALL rain machinery verified present
and running - the rain was INVISIBLE: 0.05 m half-width streaks at
0.06 alpha are sub-pixel under NEAREST minification (the edge-line
dot class again) and the night wet-grade was too subtle. FIX:
streaks 100*wet, half-width 0.16, length 1.5, alpha 0.17, field
pulled to 4-22 m ahead; wet grade lit-darken 0.45->0.62 toward a
cooler blue, emissive boost 0.35->0.6. VISIBILITY LESSON: any thin
additive element must be sized against the INTERNAL raster, not
world units - if it matters, make it several pixels at its typical
view distance. DIAGNOSIS 2: traffic lat +1.9 = the LEFT half = the
player lane in left-hand-drive Japan; flipped to -1.9 both stacks.
ToD + End drive confirmed good by user. Screens 574 + tc green.
SESSION END STATE 23 AMENDED (v16.3a): ZLEN scope + debug chips.
USER hit: Uncaught ReferenceError ZLEN is not defined - the zone
length const lived INSIDE makeRoad while the new lighthouse mesh
condition and glow pass referenced it at module level. node --check
cannot catch unbound identifiers; the smoke harness (v15scan.cjs:
build 24 chunks x 5 seeds through cliff cells) now exercises the
exact path. FIXED: ZLEN hoisted next to DS/CHUNK/HALFW, inner shadow
removed. LESSON: when porting repo code into the artifact, module
consts (ZONE_LENGTH_M) may map to FUNCTION-SCOPED consts - grep the
declaration scope, not just the name. DEBUG CONTROLS added both
codebases: skyChip cycles Dusk/Night/Deep/Dawn (todT=k/4 lands on
pure palette keys), rainChip forces rain on/off (rainClock=99999
parks the state machine). Repo: data-test drive-sky / drive-rain.
574 screen tests + tc green.
SESSION END STATE 23 (v16.3): weather, time of day, living night,
drive card, juice. USER: rain+ToD; no-collision oncoming traffic +
lighthouse + window flicker; end-drive card (distance/time/top
speed/longest drift, NO zones - de-emphasise zones player-side);
subtle tyre smoke. Drift-physics rework DEFERRED (user: phone not
the venue).
ARTIFACT: TOD table 4 moods {fog,amb,emi,skyT/M/L}, todT/900 s,
todNow cosine blend; shader uAmb/uEmi/uWet + sky uSkyT/M/L; rain
state machine (on 55-150 s / off 80-220 s), wet/6 s lerp, grip
*(1-0.32*wet), fogN*(1-0.4*wet); rain audio buses; glow-pass payload
= smoke pool 48 + rain streaks (60*wet) + lighthouse flash sin^24 +
rotating 46 m beam + window flicker (analytic re-derive of village
houses) + traffic headlight halos; traffic {station,lat 1.9,v 13-18}
spawn +380 clock 14-34 s, grey trafBuf drawn heading+PI, lights in
slots 8-9 (lamp loop capped 8); lighthouse tower mesh on cliff cells
at |station%ZLEN-140|<DS*0.51 lateral (HALFW+3.4)*side; card overlay
THE DRIVE + endChip; zone HUD stat REMOVED.
REPO: mirrored fully. Renderer: mood field + render(mood?) + fx
field {timeS,wet,car pose,smoke,lighthouses,windows,traffic(full
pose)} consumed in the ungated glow pass; trafBuf built in setCar;
light slots 8-9 injection; lighthouse mesh; SKY_FS uniforms.
Screen: TOD/rain/traffic/smoke/drift-stat state in the FIXED loop
(deterministic), fx assembly + mood per frame, wet grip at
stepArcade, audio.update(...,wet); summary gains driftS + template
row; drive-zone span REMOVED (no test referenced it). Audio: rain
buses rnG/rwG + wet param.
CLOBBER EPILOGUE: the earlier lost-write event also ate the tyre
panner, master-ramp and chip rewrite in the ARTIFACT (repo had
them); restored + rain added. STANDING RULE, now practised: after
EVERY write, grep the file for the new markers before moving on;
apply batches skip-tolerantly when the file may be ahead of your
model of it. Tests 1072 green, tc clean, NO commits.
SESSION END STATE 22 (v16.2): PARITY AUDIT + designer review.
USER: 'are you 100% sure the game files align with the artifact?'
METHOD: identical scenarios through both stacks, numbers diffed.
ROAD: byte-identical, 3 seeds x {geometry, elevation, heading, tilt,
ridge, zones+cliffs} - pinned by roadGen.golden.test.ts (checksums
verified cross-stack; any drift breaks it). PHYSICS: AE86 + EG6
digit-identical; R32 off by ~1% -> fingerprinted the LAST fork:
artifact applies aeroGripMultiplier to mu/brakeMu, repo did not, and
only the R32 has downforce (0.339 stock). Ported sim's
aeroGripMultiplier into stepArcade (mu, brakeTotal, brake-side
muF/muR; drive-side traction without aero, mirroring the artifact
exactly). Post-fix: ALL metrics digit-identical. ASSURANCE: the two
stacks are now provably the same machine; the golden test holds the
road side permanently. PARITY-HARNESS BUILD LESSONS: content
constants import from @midnight-garage/content (not sim); splicing a
function between files leaves brace residue - reread after splicing.
Tests 1072 green, tc clean. NO commits (standing rule).
SESSION END STATE 21 (v16.1): braking at TRUE grip.
USER: RWD brake oversteer 'as bad as before the fix'. ROOT CAUSES,
two layers: (a) the engine-braking feature (added AFTER the braking
fix) stacked unmanaged drag on the RWD rear, bypassing EBD -> MSR
added ((1-0.7*satR)*(1-0.5*brake)); (b) THE MEASUREMENT BUG: my
brake harnesses fed stepDrive RAW drive-dump params (mu 0.84) while
the game runs loadCar-MAPPED params (mu 1.43, brakeMu 1.17) - every
braking number was tuned at ~60% of shipped grip. The repo test
(properly mapped) failing at 1.91 while my harness read 0.86 was the
tell. HARNESS RULE: measurement harnesses must construct the car the
way THE GAME does (loadCar/arcadeCarFor), never from raw dumps.
At true grip the snap reproduced (184 deg trail, yaw 2.38). FIXES:
brake friction-circle relief made REAR-ONLY (front 1.0 = stabilising
understeer, rear 0.5), EBD 0.62, ESC-under-braking (excess over
1.15x rKin + 0.12 damped at brake*3.1) - all cause-level, all in
both stacks (axleForces grew brakeReliefMul). MEASURED TRUE-GRIP:
disturbed 5 deg; trail 102 vs 108 kinematic; downhill 89 deg / 1.03;
moderate at-speed 1.17 vs 1.26 commanded (mild understeer); slide
smooth 0.116/step; FWD lift 0.19->0.81 and AWD 0.99 unchanged.
METRIC LESSONS: a heading bound must be kinematic-relative (stop
distance sets the reference); never reference post-assist steerRad
in an excess metric (countersteer collapses it); an apostrophe in a
single-quoted test name breaks the parse (drivers write "driver's").
KNOWN MINOR DIVERGENCE: artifact applies aeroMult to mu/brakeMu in
stepDrive; the repo arcade layer does not (~5% at speed) - accepted,
documented. Tests 1071 green, tc clean.
SESSION END STATE 20 (v16 polish): edge lines, sound truth, meshes.
USER CORRECTIONS: (1) the DOTTED lines are the EDGE lines (sides),
not the centre dash; (2) Sound and Reset chips broken.
ROOT CAUSES: edge dots = 0.62 m band going sub-pixel under NEAREST
minification at distance; sound = SND.master created at gain 0 with
NO ramp anywhere (sndUpdate never touched it) - the chip half-worked
via a confusing two-tap off/on cycle. FIXES: master ramp in sndUpdate
every frame (self-healing, chip just flips SND.on; chip shows
Sound on/off text); Reset chip flashes on tap. Edge line = 0.45 m
emissive core + 1.2 m lit halo (C_EDGE_HALO); internal res floor
H/280 -> H/330. REPO AUDIO WAS FINE (init ramps 0.85) - artifact-only
bug. Trees: pre-compaction already two-tier; added per-tree hue
jitter (both codebases). Houses: pre-compaction already pitched -
untouched. Car: REPO already had the bonnet wedge; artifact caught
up + both gained dark bumpers. Tyre StereoPanner pans by vLat/6
capped 0.6 (audio.update grew latMs=0 tail param; screen passes
st.vLatMs). REGEX LESSON: [^)]* stops at the FIRST close paren -
appending an arg to a call whose args contain nested calls mangles
the inner call (bit nearestLampM); prefer anchored string replaces
for call edits. PATCH-BATCH LESSON (repeated 3x this turn): grep
every anchor fresh IMMEDIATELY before batching; use skip-tolerant
application when the file may be ahead of your model of it.
Tests 1069 green, tc clean.
SESSION END STATE 19 AMENDED 5 (v15.8): drivetrain identity.
USER: cars feel placeholder-ish; AE86~R32 acceleration; RWD easiest;
AWD powerslides; FWD lacks lift-off oversteer. FACTS: cars are real
sim instances; BENCH 0-100: R32 5.1 / EG6 6.7 / AE86 8.5 s, 0-160
12.7/18.1/26.0 - parity FEEL = turbo envelope bog below boost + the
speed-target controller masking transients.
CAUSE FIXES (artifact stepDrive + repo stepArcade):
1. ENGINE BRAKING (all cars): engBF=max(0,0.35-throttle)/0.35 x 0.22
   driveCap x speed ramp, split across the DRIVEN axle(s). The lift
   gesture now physically exists. Trail rotation rose 93->118 deg
   (band ok, drift-friendlier); disturbed brake still 5 deg.
2. FWD lift-off: rear peakSlip x (1-0.38*min(1,-axF/2.5)) gated to
   brake<0.25 (EBD owns braking). Yaw 0.19 part-throttle -> 0.87 on
   lift (4.6x tuck-in). FIRST ATTEMPT LESSON: without engine braking
   a lift only decels ~0.5 m/s^2 - the derate had nothing to key on;
   the missing CAUSE was engine braking, not a bigger multiplier.
3. AWD ATTESA: splitF=min(0.68, base+0.5*min(1,latSatRear)); power
   corner rear sat 1.10 -> 0.99 (planted).
Tests: acceleration ordering (gaps >1 s), AWD sat <1.05, FWD lift
>2.5x and <1.6. 32 drive tests green.
SESSION END STATE 19 AMENDED 4 (v15.7): braking physics.
USER: (1) uncontrolled skids braking off-straight even w/o steering;
(2) abrupt stop ending a sideways braking slide. DIAGNOSIS: (1)
brake-induced oversteer: load transfer empties fzR while the friction
circle (satPoint 1) spends the rear's grip on brake force -> lateral
collapse; (2) standstill clamp keyed on |vLong|>0.15 only - a
sideways slide crosses vLong~0 at speed and the clamp zeroed vLat
instantly (the wall). FIX (artifact stepDrive + repo stepArcade):
brakeSaturationRelief 0.7 on the friction circle for demand<0; EBD
ebd=1-0.55*min(1,latSatRear_prev) on the rear brake share (handbrake
exempt); clamp now st.speed<0.35 && |driveTotal/effDrive|<1.
MEASUREMENT LESSON: first arc-brake assertion flagged 93 deg as a
spin - it is the KINEMATIC rotation (distance*tan(lock)/wheelbase ~
97 deg); test the user's actual case (disturbance + steer 0) and band
the steered case instead. Harness v15brk.cjs: disturbed 2 deg / yaw
damped / sat 0.37; trail 93 deg no loop; slide settles 1.3 s, worst
step 0.078 m/s (~0.96g). Repo tests mirror both. Trail-braking
regression unaffected (EBD frees rear grip -> more rotation).
SESSION END STATE 19 AMENDED 3 (v15.6): slider truth + resets.
ROOT CAUSE of the misaligned slider: CSS carried STALE static
geometry - .vnotch/.vfill bottom:35% and .vthumb bottom:35% with
margin-bottom:-17px - fighting the JS px positioning after DET moved
to 0.16. LESSON: when a constant moves from CSS to JS, strip EVERY
static occurrence in the same commit; grep the stylesheet for the old
value. Now JS owns notch bottom, fill base and thumb px; DET shrunk
to 0.10 (reverse band smaller per user); fill height scale 94 to stay
under the track cap. Repo mirrored (CSS notch/fill 10%, thumb static
props stripped, THR_DET 0.10).
RESETS: shared gentle routine now fires on water hazard OR
|lateral|>24 m (cliff flank tumbles) OR pendingReset from a new HUD
Reset button (artifact rstChip; repo data-test drive-reset beside the
sound chip). Tests 1064 green, tc clean.
SESSION END STATE 19 AMENDED 2 (v15.5): real geometry + control polish.
USER: thumb overflowed track; wants hard zero stop; reverse springs
back, forward persists; BRAKE beside slider; car hovered over terrain.
SURFACE: surfZ/surfaceZAt = analytic mean of the mesh cross-section;
FLANK-DISTANCE CONVENTION LESSON: mesh tzf takes lateral-minus-HALFW
(quads pass 40/92 at absolute 45/97) while trees/rocks passed absolute
- unified everything on flank distance; harness proved 0.00 m bank
mismatch after (was 2.66 m), continuity 0.56 m per 0.4 m worst (steep
ramp itself). Car: axle-sampled z (weighted to CG), pitch from
zF-zR/wheelbase, roll from track heights over 1.56 m, m4ModelYPR
added (yaw*pitch cols then roll mixes l/u axes); wheels too; headlight
matrix stays YP. Physics: stepDrive/stepArcade gained latGradePerM
(optional, default 0): vLat += (ay - g*latGrade)*dt; zero on-road so
register tests unaffected; bank-slide test added. Camera follows carGz.
CONTROLS: thumb positioned in px over (track - thumb) so it stays
inside; magnetic zero detent |f-DET|<0.045; reverse-only spring-back
restored; BRAKE moved INSIDE the slider flex cluster (stopPropagation
on its pointer events - parent slider captures otherwise, a real bug
caught pre-ship); repo mirrors all. Repo trees/rocks were MISSING tilt
entirely (dropped in a corrected patch batch - re-check every member
of a failed batch, not just the one that threw). Tests 27 drive-local.
SESSION END STATE 19 AMENDED (v15.4): Slow Roads-inspired round.
CONTROLS: slider = speed TARGET (persistent, quadratic map to 62 m/s,
notch 0.16, small reverse band to -3.5 m/s); speedTargetControl pure
law (err/5 throttle, trim brake past 2.5 m/s over, reverse
err-proportional /1.2); dedicated BRAKE button (ramp 140 ms in /
100 ms out) forces throttle to 0 while held; physics gained a tiny
reverse gear (0.30 driveCap backwards, floor -3.6, engages <=0.25 m/s,
brakes oppose motion via bs sign; revActive DECLARED BEFORE driveTotal
in repo - TDZ bit once). HUD shows R. Sim: cruise 28.9@30, brake
3.5 m/s after 3 s, reverse -1.86@-2, recovery clean.
TERRAIN: signed per-cell cross-slope tiltAt (seed^0x5aa3 mag,
seed^0x1b57 sign, coast sign forced -waterSide, TILTZ
0.9/0.7/0.12/0.6/1.0); ramp 0 to 11 m, 1.05/m to 40 m, 0.65/m to
92 m (max ~64 m); applied to hill+valley quads, ridges (+0.72 factor,
bases shifted), trees, rocks; water side untouched. BLEND LESSON:
full-cell cosine diluted cell character (village centre read 0.22);
now holds cell value across middle half with 25% edge ramps -
continuous at f=0 (both sides give mix(c,c+1,0.5)).
HEADLIGHTS: already existed (uHp/uHd cone 0.83..0.955) pre-compaction.
Tests 1062 expected green incl reverse determinism + tilt zone
promises. Rasterised preview-tilt.png (seed 12 SUMMIT tilt 0.98):
excellent hillside read.
SESSION END STATE 19 (v15.3): world-vanish + verticality + cliffs.
USER REPORT: world randomly stopped rendering (SUMMIT, 1.3 km, car+HUD
alive, sky visible). FORENSICS: 40-seed x 25-chunk NaN scan clean
(75.8 M floats); window-arithmetic sim clean over 4 km x 5 seeds (min
7 live buffers); watchdog-rebuild path clean at 55 moments/seed.
VERDICT: environmental context loss; old watchdog could fire DURING
loss (isBuffer false on lost ctx) filling the list with null handles,
and could never recover an EMPTY list (guard required non-empty).
FIX (artifact + repo renderer): rebuild into temporaries and swap;
watchdog v2 skips while ctxLost, treats empty as damage, checks first
AND last buffer; restore handler re-inits programs + re-uploads chunk
meshes retained CPU-side; artifact adds a 3 s restore nudger via
WEBGL_lose_context.
FEATURES: n9 long swell (seed^0x2e77) 34 m @ 1400 m under the zone
LIFT (span ~58 m / 10 km, max grade 17-21%); coast cliff cells
(hash 0x2fe1, c*57, <0.45) with 22 m sheer faces ALREADY EXISTED in
the artifact from the pre-compaction session, now ported to repo along
with LIFT elevation, ridge silhouettes (ridgeAt, walls at 205/330 m,
skipped over sea) and summit valley vdrop -26. WATER RESET: helper
waterHazardAt(zone,lat) in roadGen (cliff lip HALFW+2.0, beach
HALFW+8.5); artifact frame loop + DriveScreen snap car to nearest
sample, vLat=0, vLong<=6, yawRate=0, re-locate. Tests 1059 green,
typecheck clean. Register unchanged: floor 124.0, rMin 20 m, median
tight 170 m.
THE DIVERGENCE LESSON: the artifact carried LIFT elevation, cliffs,
ridges, vdrop and ctx-loss scaffolding that the compaction summary and
this checkpoint did NOT record; three patch batches failed on stale
anchors before reading the live file. RULES: (1) before ANY patch
batch, grep the live file for each anchor; (2) before porting to the
repo, diff the artifact formulas against the repo rather than trusting
memory; (3) checkpoint EVERY feature the moment it lands, including
scaffolding.

AMENDED 2 (v15.2): engine voice widened (detuned saw pair, triangle
0.25x sub + sine 0.5x, exhaust = lowpassed noise AM'd at firing freq
routed into engF; engG 0.085+load*0.12; computeMixTargets grew
exhaustLpHz/exhaustGain, tested). Road register TURNED UP on user ask:
third octave 58m@175 (medium sweepers), short octave 4+15m@80, tau
10.4, mz=min(1.95, zoneM*(0.5+chr^1.5*1.7)), elev 16@430+5.5@150+
1.8@70 (n8 seed^0x19d3). Zone mults now 1.45/1.25/0.60/0.45/1.90.
MEASURED: floor 124.0, min radius 20 m, median tight 170 m, max grade
21%, 8/14 technical windows, calm lives in village/coast zones.
Test pin changed: 1/kMax >15 AND <38 (sharpness pinned both ways);
skirt comment fixed 110->92. Rasteriser lesson: dump THREE chunks
(CHUNK=100 samples, bends past sample ~199 need chunk 2) - empty-sky
render means camera sample outside dumped mesh coverage.
AMENDED: two field fixes after user test. (1) No sound on mobile:
AudioContext was created on pointerdown but never resume()d; iOS
starts contexts suspended and only honours resume from touchend/click.
Artifact: sndKick (init+resume) on pointerdown/pointerup/touchend/
click/keydown. Repo: DriveAudio.init reentrant (resumes suspended ctx)
+ window pointerup gesture listener in DriveScreen. (2) Tune sheet
rendered UNDER driving sliders (no z-index, pad later in DOM):
artifact #sheet z40 / #hud z30 / #pad z10; repo .overlay z40 /
.pad z10.
V15 SHIPPED: sound stage + slider controls + five road zones, artifact
and repo in sync, all green (suite 1058/1058, drive 21/21, typecheck
clean after AudioParam void-return fix in audio.ts T helper).
- ZONES: 760 m cells, hash thresholds .30/.52/.68/.84 ->
  HILLS/FOREST/VILLAGE/COAST/SUMMIT; 10% edge blending of continuous
  params; effective wander mult capped 2.1. Colours: wall/roof/window/
  sand/bank/water/glint/rock. Shader uniform uFogN per frame from
  zoneAt(car station). zn declared at TOP of per-sample builder body
  (TDZ bug otherwise). Village houses <=14 m lateral: safe
  unconditionally under the >=100 m stretch floor. MEASURED with zones:
  floor 136.8 m, min radius 28 m, all 5 kinds in 8 km of seed 7;
  village 20 lamps + windows verified by colour markers; village+coast
  rasterised and eyeballed good.
- AUDIO: fully procedural (no samples). Artifact AUDIO-BEGIN/END
  block; repo drive/audio.ts: pure computeMixTargets (5 tests) +
  DriveAudio class. Engine 3-osc, tyres 2x bandpass noise, wind,
  crickets (LFO-chirped, zone gains, negative-swing guard via cld
  scaling), sodium hum from nearestLampM, coast waves (carrier AND lfo
  depth gated). Init on first gesture; Sound toggle in HUD.
- CONTROLS v2: left vertical slider, notch 35%: above=throttle
  PERSISTENT, below=brake sprung 140 ms; right horizontal steer slider
  sprung to centre 130 ms quadratic; sign flip (thumb right -> negative
  input.steer). H-brake hold button. Keyboard fallback; axes win when
  active. Old buttons removed.
- Renderer: nearestLampM(x,y) public; render() gained fogNearM param.
- Docs: zones/sound/controls sections + tuning tables added.
- Tarball rebuilt with midnight-roads-v15.html (46 entries).
- NEXT CANDIDATES (user priorities): switchback architecture
  (repulsion-steered centreline + min-cone conforming terrain + mesh
  lag, sketched in STATE 17), car-feel differentiation, more zone
  content. Persistence DEFERRED by user. STILL NO COMMITS.

## SESSION END STATE 17 (older)
V14: user confirmed the overlap bug RESOLVED. Two polish asks + a
design-direction discussion.
- Fog ("background blur") eased: smoothstep 90/380 -> 140/430.
- Road variety: character noise (820 m) modulates two wander octaves
  (330/84 m); slope = 1.05*tanh(sum/1.05) keeps the monotone
  no-overlap guarantee (analytic floor 103 m); slope LOW-PASSED over
  11 m during integration slew-limits curvature. GenState carries
  y and dl; y integrates clamped slope. Valley skirt 110 -> 92 under
  the new floor. MEASURED (16 seeds x 5 km): floor 128.7 m, min
  radius 27 m (tight elbows, the closest to hairpins this
  construction allows), median tight 213 m, headings <=46 deg, calm 3
  / technical 2 / mixed 10 windows per 5 km. Rasteriser eyeball of
  tightest early bend: clean.
- TRUE stacked switchbacks deliberately deferred: they require the
  repulsion-steered centreline + min-cone conforming terrain
  (concave => interpolation-safe) + one-chunk mesh lag; architecture
  sketched in the design reply, build on user approval.
- Tests 15/15 (self-approach pin >120 still holds at measured 128.7),
  suite exit 0, typecheck clean. Tarball with midnight-roads-v14.html.
- NEXT: user reading the design-direction essay; expect priorities
  discussion (audio, touch controls in the game screen, switchback
  architecture, car-feel differentiation, zones/landmarks, ambient
  persistence). STILL NO COMMITS.

## SESSION END STATE 16 (older)
V13: THE map-on-top-of-the-map bug, root-caused for real and killed.
- User (rightly) escalated: one bug since the start, still present in
  v12 (giant terrain wall across road and view at 1.8 km).
- Honest accounting of my failed proofs: v11's invariant checked
  VERTICES (crossing happens between them); the first surface scan
  matched the wrong palette (vacuous - ALWAYS print inspected counts);
  the second surface scan found nothing because the mechanism was
  bigger than skirts.
- MEASUREMENT that broke it open: min plan distance between samples
  >150 m apart in station = 0.2-0.9 m in 13/16 seeds. The integrated-
  heading centreline is a 2D RANDOM WALK: the ROAD CROSSES ITSELF.
  Tarmac over tarmac. Unfixable by any skirt/tree geometry.
- FIX (v13, artifact + repo identical): monotone-progress
  construction. lat(u) = noise wander (88@360 + 9@95); heading =
  atan(dlat/du); x advances by DS/hypot(1,dlat) (arc-length stepping,
  spacing verified 1.99..2.01 m); y = lat(x). x monotonic and
  |dy/dx|<1 => far-in-station is far-in-plan. MEASURED: self-approach
  floor 146.4 m over 16 seeds x 5 km (skirts reach 110). Min turn
  radius 69 m, headings <=39 deg: sweepers, no hairpins (a road that
  can hairpin can cross itself; switchbacks would need a global
  planner - documented as out of scope). curvatureAt derived from
  heading differences; curvature register test still passes.
- Rasteriser eyeball: clean sweeping road, unbroken lines, posts,
  trees, no walls. Lamps still spawn; window sim + boundary coverage
  still green.
- Tests: NEW self-approach pin (>120 m floor, 2 seeds x 3 km) in
  roadGen.test.ts; drive 15/15; full suite exit 0; typecheck clean.
- Docs: generation section rewritten; monotone-progress rule added as
  the superseding regression rule.
- STILL NO COMMITS. Tarball rebuilt with midnight-roads-v13.html.

## SESSION END STATE 15 (older)
V12 (artifact midnight-roads-v12.html + repo): the v11 playtest's four
findings, all fixed and pinned.
1. 2 KM STALL (real bug, introduced in v10): ensureChunks/maintainWindow
   compared window-relative need against all-time chunk total; once
   drops began, generation stopped near chunk 11 (~2.2 km). Fix: need
   uses hint + dropped (global vs global). Pinned by a 2.1 km pure
   window-sim test in roadGen.test.ts (also asserts window bounded at
   exactly 10 chunks steady state: use <=, not <).
2. BLACK BAND AT EVERY CHUNK BOUNDARY: builder end index off-by-one
   (min(len-2,...) left the final 2 m segment of every build unbuilt:
   a see-through strip). Fix: min(len-1,...). Pinned by build-range
   coverage assertions in the same test plus the last-corner-vertex
   geometric check in the artifact smoke.
3. ORANGE BOXES around lamp heads: the glow halo was a flat additive
   quad. Now an 8-triangle radial fan, bright centre [0.5,0.3,0.09] to
   BLACK rim, additive ONE,ONE: soft round halo, r=1.5.
4. VISUAL NOISE: posterise 14->18 levels, dither 0.1->0.06 (style
   intact, gradients smooth).
Verified: v12 smoke (4.2 km sim, 28 chunks, no holes, boundary corner
vert present), drive tests 14/14, full suite exit 0, typecheck clean.
Docs updated (window-arithmetic rule + halo/pixel constants). Tarball
rebuilt with v12. Awaiting playtest; still NO COMMITS.

## SESSION END STATE 14 (older)
V11 (artifact midnight-roads-v11.html + repo, identical): the REAL
"map on top of the car" bug found and fixed, plus dither and lighting
feel from the v10 playtest.
- ROOT CAUSE at last: corridor SELF-INTERSECTION. Each stretch grew
  terrain to 190 m laterally with the valley outer edge at ABSOLUTE
  z=-4.5. Winding road passes within 190 m of itself constantly; when
  a stretch dips low, other stretches' skirts genuinely hang above its
  tarmac (correct depth, real geometry: never z-fighting). Trees up to
  59 m out also landed on other stretches.
- FIX (corridor-exclusivity rule): skirt heights strictly RELATIVE and
  descending (hill band z-2.2-r*1.8 at 40 m, valley z-9 at 110 m, no
  absolute heights anywhere); extents inside min self-approach
  distance; trees 11-35 m out AND checked against the whole generated
  window (skip if within HALFW+8 of any sample >40 m away by station;
  per-segment presence so window dependence cannot tear shared
  geometry). PROVEN: offline scan, 12 seeds x 2.8 km, 416k
  hill/valley/leaf verts, ZERO rise above any distant stretch within
  12 m plan. Beware vacuous colour-filter checks: first scan matched
  the wrong palette entries and passed trivially; always print the
  inspected-vert count.
- Dither: was only ever tolerable because the browser blurred the
  non-dpr canvas; dpr-correct pipeline exposed it. Now 14 levels,
  amplitude 0.1 (sky and scene share the one pixelate()).
- Lines: internal target 240->280 (phone lands ~347 not 231); edge
  lines 0.5 m, dashes 0.3 m wide so they hold a pixel farther out.
- Light feel: sodium intensity x2.1/1.22/0.38 at radius 30,
  half-Lambert floor 0.5; headlight cone 0.83..0.955 x1.6, origin
  z+0.42; ADDITIVE GLOW HALOS: camera-facing emissive quads (1.15 m)
  on the 10 active lamps, blend ONE,ONE, depth test on / write off,
  drawn after wheels before post (activeLamps captured during uniform
  fill). Poles lightened [0.30,0.32,0.40].
- Verified: node syntax + v11 smoke (lamps registered), corridor
  invariant scan above, drive tests, full game suite exit 0 (132
  check lines, 0 fails), workspace typecheck clean. Docs updated
  (corridor rule + tuning rows). Tarball rebuilt with v11.
- User was still playing v10 when reporting; v11 carries BOTH rounds.

## SESSION END STATE 13 (older)
V10: the artefact fixes and the lighting engine, in artifact AND repo.
User verdict on v9: vibe right, but streaks/"map rendered twice",
broken edge lines, too dark; asked for brightness, sodium street light
segments, headlights, a lightweight lighting engine.
DIAGNOSES AND FIXES (all in midnight-roads-v10.html and the repo):
1. STREAKS/TEARS: terrain band edge heights were per SEGMENT random, so
   adjacent segments disagreed at shared corners: overlapping slivers.
   Now per GLOBAL sample index (bh(gi)); RULE: any value two segments
   share is a function of the global index, as is every cadence/hash
   (gi = i + samplesDropped/road.dropped) so rebuilds are identical.
2. BROKEN LINES + more streaks: (a) internal buffer 300 px was BIGGER
   than the mobile canvas -> NEAREST minification deleted rows. Now
   dpr-aware backing store + integer-only upscale (scale=round(H/240)).
   RULE: never minify the pixel buffer. (b) Edge lines were stacked
   2 cm above the verge and depth-fought at 16-bit: now the line sits
   BESIDE the asphalt coplanar; verge starts outside it; dashes +0.03;
   depth range 0.7..460 (was 0.4..520).
3. LIGHTING ENGINE (per-fragment): directional 0.62 amb + 0.45 diff;
   10 point lights (uLp[10] pos+radius, uLc[10]) fed each frame from
   nearest sodium lamps (27 m radius, att^2, half-Lambert 0.6/0.4);
   headlight spot from car nose along pitched body axis (uHp/uHd,
   smoothstep cone 0.86..0.965, 34 m, x1.35 warm white). EMISSIVE via
   zero-length normal (pushEmissive): lamp heads, reflector tops, car
   head/tail lamps; shader vEm -> full albedo, still fogged.
4. SODIUM ZONES: road.litAt(station) = noise(s/240)>0.52 (~49% lit,
   median first lamp 90 m, verified over 40 seeds); lamps every 16 m
   alternating sides, 4.6 m poles + arm + glowing head; reflector
   posts skip lit zones. Chunk builder returns {mesh, lights}; renderer
   keeps chunkLights parallel to VBOs, uploads nearest 10.
5. Brightness: fog/clear [0.16,0.12,0.26]; sky bands lifted; ambient
   0.62. Pitfall fixed en route: artifact sample field is `station`
   (road.lit(p.s) silently produced zero lamps; smoke test now asserts
   lamps exist on a lit road).
VERIFIED: node syntax + smoke (band continuity, lamp registry, emissive
car verts, lit stats), rasteriser render of a lit stretch (geometry
eyeballed), game suite exit 0 with 13/13 drive tests incl. new litAt
determinism/coverage test, workspace typecheck clean. DriveScreen
unchanged apart from the ChunkGeometry shape flowing through addChunk.
Docs updated (lighting engine, four regression rules). Tarball rebuilt
from full git delta + v10. Awaiting playtest.

## SESSION END STATE 12 (older)
THE LANDING. The endless mode is in the repo, tests green, docs written.
- Artifact v9 (midnight-roads-v9.html): sculpted coupe car mesh (low
  body, glass cabin, sloped screens, exposed wheels at track 0.74,
  proud lamps, spoiler for non-FWD) replacing the v8 featureless brick
  the user screenshotted; spawn moved to samples[20] so terrain exists
  behind the camera. Verified in the NEW software rasteriser at both
  close-up and 160 px game resolution: reads as a car.
- QA tool landed: tools/drive-preview/ (render_preview.py + README),
  the software rasteriser with the renderer's exact camera and lighting
  maths. USE IT before shipping any mesh or matrix change.
- Sim: driveParamsForInstance(car, model, context) added in
  drive/instance.ts and exported: params-only assembly, lapBlockers
  gated, no course. driveInstance.test.ts extended; passes.
- Game feature folder packages/game/src/screens/drive/:
  roadGen.ts (pure endless generator, window maintenance, locate,
  surfaces), arcadePhysics.ts (the converged register, DEFAULT_TUNE
  grip 1.7 slip 2.3 hold 0.985 assist 0.1 power 1.0, body-axis
  convention), arcadeConfig.ts (bridged from sim DRIVE_CONFIG),
  webglRenderer.ts (DriveRenderer class, chunk VBO lifecycle, pixel
  pipeline, mesh builders; coverage-excluded with rationale).
  Tests: roadGen.test.ts (5) incl. the smooth-surface pin, and
  arcadePhysics.test.ts (4) incl. the trail-braking-turns-LEFT
  regression pin. 12/12 pass.
- DriveScreen.vue REWRITTEN as the endless mode: setup (owned cars,
  blocked disabled, ?car= preselect honoured, course query ignored,
  assist slider) -> driving (WebGL canvas, HUD, Esc pause, End drive)
  -> summary (km, time, top speed; New road / Change setup). Back link
  to overworld. Still coverage-excluded.
- Verification: game suite 85 files / 1049 tests PASS; workspace
  typecheck clean; sim driveInstance PASS.
- Docs: docs/design/systems/drive-mode-v2-endless.md (architecture,
  tuning table, the two conventions, iteration and QA workflow, gaps).
- Parked: driveGhost.test.ts removal STILL awaits explicit approval;
  tail lamps always lit; touch controls artifact-only; grades ~20%.
- NO COMMITS (house rule; none approved). Package tarball
  drive-mode-v2-full-package.tar.gz has everything, repo-relative.

## SESSION END STATE 11 (older)
V8 BUG FIXES shipped as midnight-roads-v8-1.html (v8 superseded):
1. Vertical jitter ("speed bumps"): car z was the NEAREST 2 m sample's
   z, a staircase of up to ~0.3 m steps at speed while the camera
   smoothed. Fix: continuous analytic surface everywhere: makeRoad now
   returns elev and gradeAt (forward diff over 2 m); car z, camera eye
   and look, physics grade, skid z and HUD grade all evaluate
   elev/gradeAt at the CONTINUOUS station from locate(). Verified: max
   height change 0.023 m per 0.3 m of travel. RULE: never sample
   discrete track samples for continuous quantities; samples are for
   geometry meshes and locate() only.
2. Car now PITCHES with the slope: m4ModelYP(yaw, pitchUp) = Rz(yaw)
   times Ry(-pitch) (nose-up positive, verified nose lifts), pitch =
   atan(gradeAt) smoothed tau 0.15 s; wheels offset along the pitched
   body axes (body[0..2],[4..5] columns) so they sit on the slope.
3. Film grain: dither was 0.9 of a step at 6 levels. Now 10 levels,
   0.3 amplitude, same IGN pattern, both sky and scene shaders.
All node-verified (v81test.cjs): syntax whole-script, elevation
continuity, pitch matrix direction, gradeAt = finite difference.
Still not visually tested (no GPU). Awaiting user verdict on v8.1 look
and feel; landing plan from STATE 10 unchanged.

## SESSION END STATE 10 (older)
PRODUCT PIVOT, USER-DECIDED: the drive feature is now "Slow Roads with
a stylised pixel-art look": an ENDLESS, seeded, procedurally generated
road. Their words: real 3D approved; lap sims stay separate; "this is
a driving mode not a racing mode"; car physics carry over; do NOT
replicate our specific tracks. Consequences, recorded:
- Touge replication (hakone/misaki in the drive mode), lap timing,
  target times, and the ENTIRE ghost-vs-lap-model calibration thread
  are DEAD for this feature. driveGhost.test.ts should be removed or
  repurposed at landing time: get explicit user approval first (test
  deletion). The lap model, test track screen and economy are
  untouched and remain the racing-adjacent side.
- V8 SHIPPED (midnight-roads-v8.html): v6.1 physics + tune sheet
  unchanged. Endless generation: mulberry32-seeded value noise;
  curvature (n/300)*0.0115 + (n/90)*0.0045 (observed min radius 80 m);
  elevation 16 m @ 430 m + 5.5 m @ 140 m (observed max grade 19.7
  percent: single-constant tune if too steep); DS 2 m, CHUNK 100
  samples, AHEAD 5 / BEHIND 2, per-chunk VBOs freed on drop, station
  monotonic (odometer HUD, no wrap). HALFW 5.0; off-road = grass
  surface from config (no barriers by design). Trees: seeded scatter,
  trunk cross + two-tri cone, two leaf palettes. Pixel pipeline:
  scene renders into a 300-px-tall NEAREST framebuffer then upscales
  (image-rendering pixelated), posterise 6 levels/channel + IGN dither
  in-shader (sky and scene), fog into a violet night gradient sky.
  "New road" chip and R reseed. Playground/modes removed.
- VERIFIED in node: whole-script node --check clean; generation
  deterministic per seed; spacing exact; meshes finite; a missing-
  helper bug (pushQuad/pushWall/buildCarMesh/buildWheelMesh not
  sliced from v7) was CAUGHT BY THE SMOKE TEST and fixed: keep the
  symbol-presence check in future artifact builds. Not visually
  tested (no GPU).
- LANDING PLAN (supersedes prior): after user verdict + tune line,
  create packages/game drive module: roadGen.ts (seeded gen, pure,
  TESTED), webglRenderer.ts, physics register landing in sim
  (linear-hold tyre, fixed lock, soft cut, optional assists),
  DriveScreen becomes setup -> endless drive (odometer, no results
  phase or a simple "drive summary"). Board/ghost targets: not part
  of this feature any more.

## SESSION END STATE 9 (older)
RENDERING DIRECTION DECIDED: REAL 3D (raw WebGL, no dependency).
User reported v6.1 elevation as "floating tracks in the distance, flat
up close" and asked honestly whether to switch to real 3D. Root cause
accepted: the canvas painter draws an elevated road RIBBON over a flat
screen-space ground fill with no terrain and no depth buffer; near
field flattens because the camera rides the same terrain. The painter
approach hit its ceiling (crest artefacts flagged since v3, hairpin
occlusion approximated by sample index). Verdict given to user: yes,
switch; raw WebGL keeps the no-new-deps rule (three.js would need
their explicit approval and buys nothing needed for flat-shaded
low-poly, one light, fog).
V7 SHIPPED (midnight-drive-v7.html): physics/tuning/UI identical to
v6.1; renderer replaced with raw WebGL: one shader pair (directional
0.45 + ambient 0.55, drift tint mix by uSlide, depth fog 130-430 m to
night colour), interleaved pos/nrm/col stride 36; depth test on, cull
off (two-sided). World mesh per track: road quads, THREE terrain
skirts per side (verge 9 m, foothill to 46 m at z*0.45-1.5, valley to
170 m at -3.4) so elevation reads as landscape, kerbs, armco walls +
top rail, crossed-quad posts with amber caps, centre dashes, start
chequer; playground = plane + grid quads. Car = box mesh per car
(tone by drivetrain, glass roof inset, tail lights) + 4 wheel meshes
drawn with per-wheel model matrices (fronts rotate with steerRad).
Skids = dynamic VBO of ground quads (cap 900). Camera rig unchanged
(back 9, height 4.2, ahead 8 @1.1, fov 62; eye z tau 0.10, look z tau
0.35 over 2.2x ahead). Track mesh spans lap 1 + 120 samples overrun
(stages do not geometrically close; wrap is still a teleport).
VERIFIED: node smoke test (v7test.mjs) on the extracted MATH/MESH
blocks: 75144/1218/54/30 verts, zero non-finite, ahead point projects
to NDC centre with valid depth, left point lands left. NOT visually
tested (container has no GPU): if the user reports a black screen or
artefacts, suspect attrib binding or winding first.
LANDING NOTE: the game-side port becomes a WebGL module in
packages/game (no dep). All prior landing steps (STATE 7/8) unchanged;
canvas renderer path is DEAD, do not extend it.

## SESSION END STATE 8 (older)
V6 VERDICT: "Okay. Better." plus two issues, both root-caused and fixed
in midnight-drive-v6-1.html (patched from v6 source, kept in outputs).
1. "Still no elevation": v6 HAD elevation but authored invisibly: one
   lap-length sine (max ~5 percent, ~2.7 km wavelength) + a camera that
   pitches with terrain = self-levelling. v6.1: harmonic profile
   HARM=[[6.5,3,0.9],[3.2,7,2.1],[1.6,13,4.0]] (A, k, phase; z = sum
   A sin(2 pi k s/L + ph)), typical 6-9 percent, crests 12+; camera eye
   ground z smoothed tau 0.10 s, LOOK target z smoothed tau 0.35 s over
   2.2x look-ahead so crests visibly swing the road; grade stat in HUD
   (down arrow = descent). Playground deliberately flat (skidpad).
2. "Braking + left steers right": REAL BUG. I rotated front axle
   longitudinal force through steer angle (F.fLong sin delta term).
   Physically real but negligible at real steering angles; with arcade
   lock 0.6 rad, sin = 0.56, so over half the braking force pointed
   against the steer exactly while the friction circle crushed lateral
   grip. The user's prototype applies longitudinal along the BODY axis
   (no cross term) which is the correct arcade convention. v6.1 adopts
   it: fx = F.fLong + R.fLong - resist; fyF = fLatF cos delta only.
   LESSON: with arcade steering angles, never rotate longitudinal tyre
   forces through steer; land this convention in packages/sim when the
   register lands.
Landing plan unchanged (STATE 7): await tune line, bake into sim,
re-derive targets on new physics, port renderer to DriveScreen, land
barriers in track.ts with tests. The v6.1 changes (harmonic elevation,
body-axis convention, camera pitch lag) are now part of that landing
spec. Housekeeping: STATE for v6 itself was owed from last session; this
entry covers v6 and v6.1 together. Tarball drive-work-10-v6-1 contains
checkpoint only; artifact sources live in /mnt/user-data/outputs.

## SESSION END STATE 7 (older)
DIRECTION RESET. The user shared their old prototype (the "drifty model
from way back") and it IS better. Root-cause comparison, accepted:
- Their tyre: LINEAR stiffness (F 5.0 / R 5.4 per rad, in g units) hard-
  clamped at grip with NO post-peak falloff; grip default 1.6g. Force
  builds over an ~18 degree slip window and sliding keeps FULL peak
  force: slides are free and always catchable. My brush curve peaked at
  ~7 degrees then DROPPED force (retain ~0.86): a punishment cliff.
- Their steering: fixed 0.62 rad authority at ALL speeds, input slew
  3.4/s. My speed-sensitive lock strangled the wheel at pace: the "dead"
  feel.
- No assists, no gearbox (no shift cuts chopping a drift), weight
  transfer mild (0.2 factor), yaw inertia mass*1.25.
- Rear saturates first (5.4 vs 5.0): eager rotation.
- Renderer: true pitched pinhole camera (back 9, height 4.2, look-ahead
  8 at 1.1, fov 62), camera yaw LOCKED to heading (no lag needed),
  3D box car with painter-sorted faces + steered wheels, GROUND GRID
  (omni-directional motion cue), persistent SKID MARKS, body colour
  flush + GRIP/DRIFT pill + rear-slip-degrees HUD.
LESSON RECORDED: I optimised for matching the calibrated lap model's
realistic grip and mistook that for the product; the product is THIS
register fed by our real car data.
V5 SHIPPED (midnight-drive-v5.html): their physics and renderer verbatim
in structure, parameterised per car (mass, hp from effectivePowerW,
grip = spec mu * ARCADE_GRIP_K 1.74, brakeG = brakeMu, launch cap from
driveCapN, cg split from wheelbase and weightDistributionFront) plus a
LIGHT drivetrain layer: stiffness bias FWD [5.4,5.0] / AWD [5.2,5.2] /
RWD [5.0,5.4] and throttle-on grip cut FWD front 0.16 / AWD 0.05 both /
RWD rear 0.14. Handbrake lockGrip 0.55. Modes: Playground (their
infinite grid) and Touge hakone/misaki (road, hills via grade force,
armco on r<=60 outer edges, lap/best timing, velocity ALSO rotated on
lap wrap). Setup pane: car select prefills real spec, grip/hp/weight
sliders emit a copyable 'tune {...}' line.
NEXT (after their verdict): land this register in packages/sim as the
DRIVE feel (replace brush falloff with linear-clamp, drop speed lock,
strip assists to optional), re-derive ghost/target times ON THE NEW
PHYSICS (board times no longer valid targets), then port renderer
choices (pitched cam, box car, skids, grid-free touge) into
DriveScreen.vue. Do NOT resurrect: falloff cliff, speed-sensitive lock,
mandatory assists, camera heading lag, sprite sheets.

## SESSION END STATE 6 (older)
USER REJECTED v3's car ("side folds open like a cardboard box") and told
me to step back and think about the product. The correct standard answer,
now implemented in midnight-drive-v4.html:
- PRE-RENDERED SPRITE ROTATIONS. A tiny software renderer (buildCarSheet)
  draws a box-model coupe (body, glass cabin, wheels, spoiler for RWD/AWD,
  baked tail and head lights, directional shading, backface cull, painter
  sort) ONCE per car into a 40-frame x 150 px sheet at load; runtime picks
  the frame nearest wrapA(carHeading - camHeading). Nothing morphs. Frame
  0 faces away; camera at (-7.5, 0, 2.9) looking at (0.55, 0, 0.55),
  fpx 300; sheet records pxPerM and groundY for scale-true blitting.
  This sheet format is exactly what real art replaces later.
- FEEL TUNING PANEL wired to the real constants, because the bottleneck is
  the feedback loop, not my guesses: Agility (steering.ayCapFactor 0.85x
  to 2.4x, rate/return up to 1.9x/1.6x), Slide hold (slideRetain 0.78 to
  0.96, falloffWidth 0.7x to 3x), Drift keep (saturationPoint 1x to 0.5x),
  Stability (assist level + yawDamp up to 1.4x), Overall grip (block.mu
  0.85x to 1.15x, brakeMu sqrt of that). Presets Sim/Street/Drift. Panel
  emits a copyable line 'tuning {...}': WHEN THE USER SENDS THAT LINE,
  bake those values into DRIVE_CONFIG (and per-preset assists) in the sim,
  then port sheet-car rendering + barriers + optional elevation into
  DriveScreen.vue and land barriers in track.ts with tests.
- Mobile perf framing was WRONG of me: user says feel, not perf, was the
  complaint. Do not bring perf up again.
Hills + armco kept from v3. Game screen still on v2 renderer: do not
touch until tuning line arrives.

## SESSION END STATE 5 (older)
V3 ARTIFACT delivered from user screenshot feedback (car looked 3 m tall
and leaned like Pisa; wanted elevation, barriers; feel verdict pending
until they reach a keyboard). midnight-drive-chase-v3.html:
- Car is now a REAR-VIEW pseudo-3D box (rear face + a flank whose width is
  sin(relative yaw): the drift readout), 1.32 m tall, ground shadow, small
  physical roll from body ay (clamp 0.09 rad), tail lights glow under
  brake/handbrake, spoiler on RWD/AWD. The old billboarded top-down sprite
  was the giant leaning-tower bug.
- Elevation: periodic two-sine z per lap (12 m + 5 m components, ~6 percent
  max grade, loop closes so the wrap is seamless); projection carries z;
  physics gets fx -= m*g*grade (downhill genuinely adds pace); Hills
  toggle default ON; HUD shows the live grade arrow. NOTE: target times
  are the flat lap model's, so hills make target approximate: fine for the
  feel toy, and the game-side landing must keep elevation OFF by default
  or re-derive targets.
- Barriers: samples with corner radius <= 60 get armco on the OUTER edge
  (8-sample run-in each way); rendered as a 0.9 m rail; resolveBarrier
  clamps position to halfW+0.35, kills outward velocity (restitution 0.12
  via 1.12 removal), scrubs up to 35 percent by impact angle, damps yaw.
- Mobile perf: devicePixelRatio capped 1.5, far draw 210 samples; touch
  steer input smoothed (tau 0.09 s).
NOT yet landed in sim/game: elevation, barriers, rear-view car (game
DriveScreen still uses the v2 chase renderer with the top-down sprite:
its car will look wrong the same way; port the v3 car + optional armco
once the user signs off feel). Landing plan: barrier data + resolveBarrier
belong in packages/sim/src/drive/track.ts (+ tests: clamped position,
outward velocity removed, scrub monotone with angle); elevation as an
optional per-course profile module flagged experimental.
Feel verdict PENDING KEYBOARD; if still bad, ask what the old drifty
prototype did better and tune slideRetain/falloffWidth/yawDamp/ayCap.

## SESSION END STATE 4 (older)
CAMERA CHANGED TO CHASE CAM per user feedback (top-down felt bad; they
referenced an older "drifty" prototype I have no record of, and Super
Woden-style chase view). Delivered:
- New artifact /mnt/user-data/outputs/midnight-drive-chase.html: pseudo-3D
  ground-plane projection (camera 6.2 m back, 2.7 m up, horizon 0.34 h,
  focal 0.95 h, near clip 1.1 m, far ~260 samples, painter far-to-near),
  camera heading LAGS the car (tau 0.24 s + up to 0.2 s at low speed) so
  slides visibly rotate the body, roadside posts as the speed cue, kerbs,
  chequer, night sky. Feel presets set the assist slider: Grip 1.0,
  Street 0.6, Drift 0.35 (DEFAULT Drift): full assists was why it felt
  planted and dead.
- Same renderer ported into DriveScreen.vue (draw() replaced; camHeading
  state, lag after the physics loop, camHeading -= lapDeltaHeadingRad on
  wrap; sprite is painted nose +x so it is rotated -(h-camH) - PI/2 to
  nose-up). Minimap stays top-down. Typecheck clean; screens 542 PASS.
- Debug screen stays top-down deliberately (it is a measuring tool).
If the user still prefers the old prototype's behaviour after the chase
cam: the feel levers are assists default, tyre.slideRetain / falloffWidth
(longer, more forgiving slides), assists.yawDampPerS, handbrake
rearGripCut, and steering.ayCapFactor; ask what the old one did better
(easier rotation? longer holds?) and tune those, do not rewrite.

## SESSION END STATE 3 (older)
SCOPE CHANGE DELIVERED: the full player driving feature plus a playable
mobile artifact of the physics.
- Artifact: /mnt/user-data/outputs/midnight-drive-feel.html, a 1:1 JS port
  of stepDrive/tyre/gearbox/track with the three test cars' REAL derived
  params and model lap targets embedded (dumped via a temp test, deleted).
  Touch pads plus keyboard; hakone and misaki.
- Sim: drive/instance.ts exports driveSetupFor(car, model, context,
  courseId): instance-aware params + modelLapS via the exact
  lapTimeSecondsFor assembly (computeDerivedStats, effectiveCompound,
  effectiveDownforce, physicalFactorsFor), gated by lapBlockers. Tested in
  tests/driveInstance.test.ts (matches board figure within rounding;
  refuses a scrap-banded disabling part and unknown courses).
- Game: screens/driveSession.ts (timer, interpolated crossings, best,
  formatters) + carArt.ts (procedural sprite, null-ctx safe), both tested
  in driveSession.test.ts; screens/DriveScreen.vue (setup/driving/results,
  kerbs, chequer, minimap, pause, delta HUD); /drive registered as a REAL
  route; TestTrackScreen gained a "Drive it yourself" RouterLink
  (data-test="test-track-drive") and its test stub router gained the
  'drive' name; DriveScreen.vue coverage-excluded with rationale.
- Verification: game suite 83 files / 1040 tests PASS; typecheck clean
  (fixes: tuple typing in carArt, track narrowing in DriveScreen); em-dash
  scans clean; sim driveTrack/drivePhysics/driveInstance 11/11 PASS.
- Ghost acceptance unchanged (1/9 in band); it gates nothing the player
  touches and its debugging map is in SESSION END STATE 2 below.

## SESSION END STATE 2 (older)
DRIVE SCREEN BUILT AND WORKING. New files:
- packages/game/src/screens/dev/driveDebugCars.ts (+test, 2 tests PASS:
  all 45 in-game cars derive sane stock DriveParams).
- packages/game/src/screens/DriveDebugScreen.vue (canvas 2D 640x360,
  heading-up, WASD/arrows + space handbrake, HUD, car/course selects,
  assist slider, wrapPose endless laps; sim objects deliberately
  non-reactive; keyboard edges ramped by the physics' own slew).
- /drive-debug registered in DEV routes; screen added to root
  vitest.config.ts coverage exclusions with rationale.
- docs/design/systems/drive-physics-v1.md written (decisions, directive-16
  reuse analysis, tunables, redlineRpm note, honest acceptance status).
pnpm typecheck: CLEAN across all 3 packages. Game screens suite: 539/539
PASS. Em-dash guard scan over all new files: clean. Sim: driveTrack and
drivePhysics 10/10 PASS. Ghost acceptance still RED 1/9 (unchanged since
last section; the ae86 misaki st~1150 drift mystery is the next target,
hypotheses listed below). User can now drive it: pnpm dev in
packages/game, open /drive-debug.
Remaining work: ghost tuning to green; final commit remains user-gated.

## SESSION END STATE 1 (older)
Track and physics suites: 10/10 PASS (driveTrack, drivePhysics).
_ghostDebug.test.ts DELETED (recreate freely from the recipe below).
Ghost acceptance (driveGhost.test.ts): honest and RED: 1/9 in band.
- misaki civic 1.047 IN BAND. GTR misaki 1.11, civic wangan 1.13: clean
  laps (max lateral < 5), pure pace deficit, close to band.
- ae86 all courses and GTR hakone/wangan: one or two 40-150 m excursions
  per run wreck the ratio. GTR hakone times out entirely (S-run, lap 2).
Unsolved mystery to attack first on resume: ae86 misaki develops a 7 m/s
lateral drift around station ~1150 in the braking zone BEFORE visible
curvature (probe frame: t=40, v 26.5, in 0.22, brk 1.00, sR 4.87). The
brake circle cap vs commanded curvature (latest change) did NOT move it.
Hypotheses not yet tested: slide-gate threshold 0.3 too high to catch
incipient drift (try 0.2 with brake floor 0.1); the P brake term reacting
to plan overspeed the instant kFF averaging begins to lower vHere while
the car is still straight (check vHere gradient vs actual station); rear
axle load transient from brakeTauS squeeze at high decel; misaki-specific
geometry (dump plan/curvature 1000-1300 for misaki: probe recipe below).
Probe recipe: recreate tests/_ghostDebug.test.ts: build stock block via
carBlock(model, spec.stockPowerPs, spec.tyreCompound, pace, grip, aero,
{downforceCoeff: factoryDownforceCoeff(model, aero), dragCdDelta: 0},
MINT_CONDITION_FACTORS, STOCK_BUILD_FACTORS), driveParamsFor, buildTrack
(course, 2), buildGhostProfile, loop ghostInput+surfaceAtLateral+stepDrive
at DRIVE_DT_S, log t/st/lat/v/vLat/yaw/dh/in/wheel/brk/sF/sR/uF/uR every
1-5 s, plus a plan dump loop over stations printing profile[i] and
curvature. Grep pattern used: pnpm vitest run tests/_ghostDebug.test.ts
2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^t |^plan".

## Status update (tracker rewrite era)
Steering rewritten: curvature feed-forward (AVERAGED over preview window,
4 samples: raw segment-boundary steps jerk near-peak rears loose) minus
capped correction terms: posKappa (latGain 1.0, rateGain 1.8, ay-capped
posAyFrac 0.55), headKappa (headGain 0.9, capped 0.4), yawKappa (ONE-SIDED
excess-only vs path yaw bound 1.1*|v*kFF|+0.05, yawGain 0.8, capped 0.5).
All caps are fractions of mu*g at current speed: uncapped gains that damp
one car at one speed command near-limit lateral for another. ghostInput
state param now needs vLatMs and yawRateRadS too. Rejoin target speed is
progressive (max(11, v-8)): a fixed low target slams full brake at speed.
Creep escape: v<3 and no brake => throttle >= 0.9 (grass trap otherwise).
Early lateral abort REMOVED from runGhostLap (it executed cars
mid-recovery); result now carries endStationM/endTimeS/endLateralM and the
test logs them. cornerFraction is now cornerFractionByDrivetrain
{FWD 0.94, AWD 0.92, RWD 0.90}.
Matrix now: civic misaki 1.047 PASSES band; GTR misaki 1.11 and civic
wangan 1.13 close (clean laps, small laterals: pace deficit only); ae86
everywhere and GTR hakone/wangan take 40-150 m excursions somewhere
(snap origins NOT the corner-speed margin: unknown, probe next). Hakone
S-run (~1975-2450 + lap-2 copy) and hairpin-4 (~2460, r=11) remain the
hardest section. Next: probe ae86 misaki first excursion; fix; then GTR
wangan/hakone; then pace-tune clean cars into band (levers: shift cut cost,
brakePlanFraction, throttleSteerCut, cornerFraction upward for FWD).

## Status (older, pre-rewrite)
All 9 fail but 7 reach the timed lap. Civic goes wide ~station 2450 on
hakone (max lateral ~27); ae86 never exceeds ~14 m lateral yet times out
(stuck low-speed somewhere: needs its own probe); GTR hakone shows 0.00 max
lateral = failed in lap ONE (probe needed). Wangan and misaki similar per-car
signatures. The controller frame is right; remaining work is margins and two
car-specific bugs.

## Next steps in order
1. Probe ae86 hakone (copy _ghostDebug, switch model) and GTR hakone lap 1.
   Suspects: RWD throttle behaviour in twisty run (throttleSteerCut floor
   0.15 may starve RWD exits, or rear-drive slide gating); AWD/GTR maybe a
   gearbox or launch quirk in lap 1.
2. The hakone ~2450 wide (civic): twisty chain wobble; levers: lookahead
   shaping, lateralD, cornerFraction, or a plan-side chain smoothing.
3. When all 9 complete: tune ratios into 0.96..1.07 (lap model runs 2-3
   percent fast on corner-heavy courses; if drive too slow raise
   cornerFraction toward 0.96 or cleanFraction; if too fast lower).
4. Run driveTrack + drivePhysics once more (rearBiasSafety changed braking:
   drivePhysics stop-distance band is 0.94..1.08 of ideal, still passed).
5. DELETE tests/_ghostDebug.test.ts.
6. Game screen: packages/game/src/screens/dev/driveDebugCars.ts (+test,
   sandboxCars.ts pattern); DriveDebugScreen.vue (canvas 2D 640x360 top-down
   heading-up, WASD/arrows + space handbrake, HUD speed/gear/rpm/lap/slip,
   car+course selects, assist slider, wrapPose); register /drive-debug in
   DEV routes (packages/game/src/router, import.meta.env.DEV pattern); add
   the .vue to root vitest.config.ts coverage exclusions with a comment.
7. pnpm typecheck once. 8. docs/design/systems/drive-physics-v1.md
   (decisions, directive-16 reuse analysis, tunables list for maintainer,
   redlineRpm display-usage note, how to run). 9. Final tarball to
   /mnt/user-data/outputs + present_files; concise mobile reply; no commit.

## Checkpoint log
- Session resumed after interruption; checkpoint file created.
- steerLockFor + ghost.ts + tests written; toolchain bootstrapped
  (corepack pnpm 11.10.0, frozen-lockfile install).
- Ghost stabilisation campaign: slip-allowance lock, circle-aware plan,
  feed-forward braking, curvature steering (killed the weave), one-sided
  yaw damper, safety rear brake bias, slide gate, rejoin and uTurn latches,
  output-stage unwind, brake squeeze. Track/physics tests green; ghost 7/9
  reaching timed laps. Snapshot drive-work-1.tar.gz written.

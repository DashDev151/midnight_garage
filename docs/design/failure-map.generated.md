# The Failure Map (generated)

This file is generated from the shipped content JSON: `packages/content/data/failureModes.json`, `symptoms.json`, and `diagnosticTests.json`. It can never drift from the game because it is not hand-edited - regenerate it after any change to those files:

```
node scripts/generateFailureMap.cjs
```

VS Code's built-in Markdown preview does not render mermaid: install the Markdown Preview Mermaid Support extension, or open `failure-map.html` (generated alongside this file) in a browser instead.

The design intent (ontology, laws, review notes) lives in `failure-map.md`; this file is the proof the shipped content matches it.

## Registry

62 failure modes, referenced across 17 symptoms.

| id | part | band | referenced by (weight) |
|---|---|---|---|
| valve-seals | headValvetrain | worn | smokes-on-startup (45) |
| gunked-breather | intake | worn | smokes-on-startup (20) |
| head-gasket | headValvetrain | poor | smokes-on-startup (22) |
| tired-rings | internals | scrap | smokes-on-startup (13) |
| flat-battery | ignitionEcu | worn | non-starter (45) |
| fuel-pump | fuelSystem | poor | non-starter (29) |
| seized-engine | block | scrap | non-starter (12) |
| lifter-tick | headValvetrain | poor | tick-at-idle (50) |
| blowing-manifold | exhaust | poor | tick-at-idle (23) |
| rod-knock | internals | scrap | tick-at-idle (13) |
| vacuum-leak | intake | worn | wont-idle (48) |
| tired-ecu | ignitionEcu | poor | wont-idle (27) |
| worn-cams | camsTiming | poor | wont-idle (15) |
| burnt-valve | headValvetrain | scrap | wont-idle (10) |
| worn-synchros | gearbox | worn | crunch-into-second (48) |
| low-thin-oil | gearbox | fine | crunch-into-second (14) |
| dragging-clutch | clutch | poor | crunch-into-second (20) |
| chewed-gearset | gearbox | scrap | crunch-into-second (18) |
| tired-bushes | antiRollBars | worn | clunk-over-bumps (42) |
| blown-dampers | dampers | poor | clunk-over-bumps (33) |
| steering-play | steering | poor | clunk-over-bumps (15) |
| rotted-subframe-mount | underbody | scrap | clunk-over-bumps (10) |
| glazed-pads | brakePadsDiscs | worn | pulls-under-braking (55) |
| seized-calliper | brakeCalipersLines | poor | pulls-under-braking (45) |
| fan-switch | ignitionEcu | worn | overheats-in-traffic (38) |
| tired-radiator | cooling | poor | overheats-in-traffic (35) |
| early-head-gasket | headValvetrain | poor | overheats-in-traffic (17) |
| cracked-block | block | scrap | overheats-in-traffic (10) |
| worn-tyres | tyres | worn | wheel-vibration (55) |
| buckled-rim | rims | poor | wheel-vibration (30) |
| worn-driveshaft | driveline | poor | wheel-vibration (15) |
| worn-diff-bearings | differential | worn | diff-whine (50) |
| worn-wheel-bearing | driveline | worn | diff-whine (15) |
| collapsed-centre-bearing | driveline | poor | diff-whine (20) |
| chewed-ring-pinion | differential | scrap | diff-whine (15) |
| sagging-springs | springs | worn | sagging-spring (50) |
| perished-spring-seats | springs | fine | sagging-spring (15) |
| broken-spring | springs | poor | sagging-spring (22) |
| rotted-strut-turret | chassis | scrap | sagging-spring (13) |
| panel-respray | panels | worn | quarter-panel-filler (45) |
| tired-lacquer | paint | fine | quarter-panel-filler (15) |
| rust-patch | panels | poor | quarter-panel-filler (25) |
| structural-rail-repair | chassis | scrap | quarter-panel-filler (15) |
| heater-matrix-weep | cooling | worn | damp-passenger-footwell (38) |
| blocked-scuttle-drain | underbody | worn | damp-passenger-footwell (20) |
| perished-grommet | chassis | poor | damp-passenger-footwell (14) |
| split-sunroof-drain | dashGauges | poor | damp-passenger-footwell (10) |
| rotten-bulkhead-seam | chassis | scrap | damp-passenger-footwell (18) |
| blown-flex-joint | exhaust | worn | exhaust-rasp (60) |
| cracked-manifold | exhaust | poor | exhaust-rasp (40) |
| tired-sender | dashGauges | worn | oil-pressure-flutter (50) |
| thin-cheap-oil | internals | fine | oil-pressure-flutter (15) |
| worn-oil-pump | internals | poor | oil-pressure-flutter (20) |
| worn-main-bearings | internals | scrap | oil-pressure-flutter (15) |
| stale-fuel | fuelSystem | fine | hesitates-under-load (15) |
| clogged-fuel-filter | fuelSystem | worn | hesitates-under-load (50) |
| stretched-timing-chain | camsTiming | poor | hesitates-under-load (23) |
| jumped-timing-chain | headValvetrain | scrap | hesitates-under-load (12) |
| tired-track-rod-ends | steering | worn | steering-wander (60) |
| worn-rack | steering | poor | steering-wander (40) |
| corroded-terminals | ignitionEcu | fine | non-starter (14) |
| rocker-adjustment | headValvetrain | fine | tick-at-idle (14) |

## Symptoms

### smokes-on-startup

Smokes on startup.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Gunked breather<br/>Tired rings<br/>Valve seals"]:::state
  S2["Head gasket<br/>headValvetrain POOR · odds 22"]:::mid
  S3["Gunked breather<br/>Valve seals"]:::state
  S4["Tired rings<br/>internals SCRAP · odds 13"]:::grenade
  S5["Gunked breather<br/>intake WORN · odds 20"]:::mild
  S6["Tired rings<br/>Valve seals"]:::state
  S7["Valve seals<br/>headValvetrain WORN · odds 45"]:::mild
  S8["Gunked breather<br/>Tired rings"]:::state
  S0 -->|"Cold start watch<br/>blue puff, clears · 10m"| S1
  S0 -->|"Cold start watch<br/>white and sweet · 10m"| S2
  S1 -->|"Compression test<br/>even and healthy · 25m"| S3
  S1 -->|"Compression test<br/>down on two · 25m"| S4
  S1 -->|"Breather check<br/>full of mayo · 10m"| S5
  S1 -->|"Breather check<br/>clean and clear · 10m"| S6
  S1 -->|"Overrun smoke watch<br/>big puff on overrun · 10m"| S7
  S1 -->|"Overrun smoke watch<br/>clean on lift-off · 10m"| S8
  S3 -->|"Breather check<br/>full of mayo · 10m"| S5
  S3 -->|"Breather check<br/>clean and clear · 10m"| S7
  S3 -->|"Overrun smoke watch<br/>big puff on overrun · 10m"| S7
  S3 -->|"Overrun smoke watch<br/>clean on lift-off · 10m"| S5
  S6 -->|"Compression test<br/>even and healthy · 25m"| S7
  S6 -->|"Compression test<br/>down on two · 25m"| S4
  S6 -->|"Overrun smoke watch<br/>big puff on overrun · 10m"| S7
  S6 -->|"Overrun smoke watch<br/>clean on lift-off · 10m"| S4
  S8 -->|"Compression test<br/>even and healthy · 25m"| S5
  S8 -->|"Compression test<br/>down on two · 25m"| S4
  S8 -->|"Breather check<br/>full of mayo · 10m"| S5
  S8 -->|"Breather check<br/>clean and clear · 10m"| S4
  W0("tells you nothing here:<br/>Pull a plug 5m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Pull a plug 5m"):::waste
  S3 -.-> W1
  W2("tells you nothing here:<br/>Pull a plug 5m"):::waste
  S6 -.-> W2
  W3("tells you nothing here:<br/>Pull a plug 5m"):::waste
  S8 -.-> W3
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### non-starter

Won't start.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Seized engine<br/>block SCRAP · odds 12"]:::grenade
  S2["Corroded terminals<br/>Flat battery<br/>Fuel pump"]:::state
  S3["Corroded terminals<br/>Flat battery"]:::state
  S4["Fuel pump<br/>fuelSystem POOR · odds 29"]:::mid
  S5["Corroded terminals<br/>ignitionEcu FINE · odds 14"]:::gem
  S6["Flat battery<br/>Fuel pump"]:::state
  S7["Flat battery<br/>ignitionEcu WORN · odds 45"]:::mild
  S0 -->|"Hand crank<br/>positive · 15m"| S1
  S0 -->|"Hand crank<br/>negative · 15m"| S2
  S2 -->|"Electrics check<br/>positive · 10m"| S3
  S2 -->|"Electrics check<br/>negative · 10m"| S4
  S2 -->|"Terminal wiggle<br/>positive · 5m"| S5
  S2 -->|"Terminal wiggle<br/>negative · 5m"| S6
  S2 -->|"Listen for pump<br/>positive · 5m"| S4
  S2 -->|"Listen for pump<br/>negative · 5m"| S3
  S3 -->|"Terminal wiggle<br/>positive · 5m"| S5
  S3 -->|"Terminal wiggle<br/>negative · 5m"| S7
  S6 -->|"Electrics check<br/>positive · 10m"| S7
  S6 -->|"Electrics check<br/>negative · 10m"| S4
  S6 -->|"Listen for pump<br/>positive · 5m"| S4
  S6 -->|"Listen for pump<br/>negative · 5m"| S7
  W0("tells you nothing here:<br/>Stethoscope 15m"):::waste
  S2 -.-> W0
  W1("tells you nothing here:<br/>Listen for pump 5m<br/>Stethoscope 15m"):::waste
  S3 -.-> W1
  W2("tells you nothing here:<br/>Stethoscope 15m"):::waste
  S6 -.-> W2
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### tick-at-idle

Faint tick at idle. Probably nothing.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Lifter tick<br/>Rocker adjustment"]:::state
  S2["Blowing manifold<br/>Rod knock"]:::state
  S3["Lifter tick<br/>headValvetrain POOR · odds 50"]:::mid
  S4["Rocker adjustment<br/>headValvetrain FINE · odds 14"]:::gem
  S5["Blowing manifold<br/>exhaust POOR · odds 23"]:::mid
  S6["Rod knock<br/>internals SCRAP · odds 13"]:::grenade
  S0 -->|"Revs and listen<br/>positive · 5m"| S1
  S0 -->|"Revs and listen<br/>negative · 5m"| S2
  S1 -->|"Stethoscope<br/>positive · 15m"| S3
  S1 -->|"Stethoscope<br/>negative · 15m"| S4
  S1 -->|"Tappet listen<br/>positive · 5m"| S4
  S1 -->|"Tappet listen<br/>negative · 5m"| S3
  S2 -->|"Exhaust glove test<br/>positive · 5m"| S5
  S2 -->|"Exhaust glove test<br/>negative · 5m"| S6
  S2 -->|"Oil pressure check<br/>positive · 20m"| S6
  S2 -->|"Oil pressure check<br/>negative · 20m"| S5
  W0("tells you nothing here:<br/>Exhaust glove test 5m<br/>Oil pressure check 20m<br/>Pull a plug 5m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Stethoscope 15m<br/>Tappet listen 5m<br/>Pull a plug 5m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### wont-idle

Won't hold an idle. Hunts and dies.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Tired ecu<br/>Vacuum leak"]:::state
  S2["Burnt valve<br/>Worn cams"]:::state
  S3["Vacuum leak<br/>intake WORN · odds 48"]:::mild
  S4["Tired ecu<br/>ignitionEcu POOR · odds 27"]:::mid
  S5["Burnt valve<br/>headValvetrain SCRAP · odds 10"]:::grenade
  S6["Worn cams<br/>camsTiming POOR · odds 15"]:::mid
  S0 -->|"Idle watch<br/>positive · 5m"| S1
  S0 -->|"Idle watch<br/>negative · 5m"| S2
  S1 -->|"Spray test<br/>positive · 10m"| S3
  S1 -->|"Spray test<br/>negative · 10m"| S4
  S2 -->|"Compression test<br/>even and healthy · 25m"| S5
  S2 -->|"Compression test<br/>down on two · 25m"| S6
  W0("tells you nothing here:<br/>Compression test 25m<br/>Fuel sniff 5m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Spray test 10m<br/>Fuel sniff 5m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### crunch-into-second

Crunches into second when cold.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Chewed gearset<br/>Low thin oil"]:::state
  S2["Dragging clutch<br/>Worn synchros"]:::state
  S3["Chewed gearset<br/>gearbox SCRAP · odds 18"]:::grenade
  S4["Low thin oil<br/>gearbox FINE · odds 14"]:::gem
  S5["Dragging clutch<br/>clutch POOR · odds 20"]:::mid
  S6["Worn synchros<br/>gearbox WORN · odds 48"]:::mild
  S0 -->|"Gearbox oil check<br/>low, thin, dark · 15m"| S1
  S0 -->|"Gearbox oil check<br/>full and clean · 15m"| S2
  S1 -->|"Magnet check<br/>furred with metal · 10m"| S3
  S1 -->|"Magnet check<br/>magnet clean · 10m"| S4
  S2 -->|"Clutch drag check<br/>creeps at the line · 10m"| S5
  S2 -->|"Clutch drag check<br/>clears clean · 10m"| S6
  W0("tells you nothing here:<br/>Clutch drag check 10m<br/>Try it warm 15m<br/>Linkage check 10m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Magnet check 10m<br/>Try it warm 15m<br/>Linkage check 10m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### clunk-over-bumps

Clunks over bumps at the back.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Steering play<br/>Tired bushes"]:::state
  S2["Blown dampers<br/>Rotted subframe mount"]:::state
  S3["Steering play<br/>steering POOR · odds 15"]:::mid
  S4["Tired bushes<br/>antiRollBars WORN · odds 42"]:::mild
  S5["Blown dampers<br/>dampers POOR · odds 33"]:::mid
  S6["Rotted subframe mount<br/>underbody SCRAP · odds 10"]:::grenade
  S0 -->|"Rock and listen<br/>positive · 5m"| S1
  S0 -->|"Rock and listen<br/>negative · 5m"| S2
  S1 -->|"Steering linkage check<br/>positive · 10m"| S3
  S1 -->|"Steering linkage check<br/>negative · 10m"| S4
  S2 -->|"Bounce test<br/>positive · 10m"| S5
  S2 -->|"Bounce test<br/>negative · 10m"| S6
  S2 -->|"Undercarriage look<br/>seam is rotten · 15m"| S6
  S2 -->|"Undercarriage look<br/>seam solid · 15m"| S5
  W0("tells you nothing here:<br/>Bounce test 10m<br/>Undercarriage look 15m<br/>Ride height check 10m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Steering linkage check 10m<br/>Ride height check 10m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### pulls-under-braking

Pulls left under braking.

```mermaid
flowchart TD
  SYM_pulls_under_braking["pulls-under-braking<br/>Pulls left under braking."]
  T_wheel_off_look["wheel-off-look<br/>15m"]
  SYM_pulls_under_braking --> T_wheel_off_look
  T_wheel_off_look --> T_wheel_off_look_G0(("Outcome A"))
  FM_glazed_pads["glazed-pads<br/>(worn)"]:::mild
  T_wheel_off_look_G0 -->|"w=55"| FM_glazed_pads
  T_wheel_off_look --> T_wheel_off_look_G1(("Outcome B"))
  FM_seized_calliper["seized-calliper<br/>(poor)"]:::mid
  T_wheel_off_look_G1 -->|"w=45"| FM_seized_calliper
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
```

### overheats-in-traffic

Runs hot in traffic. Fine on the move.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Cracked block<br/>Early head gasket"]:::state
  S2["Fan switch<br/>Tired radiator"]:::state
  S3["Cracked block<br/>block SCRAP · odds 10"]:::grenade
  S4["Early head gasket<br/>headValvetrain POOR · odds 17"]:::mid
  S5["Fan switch<br/>ignitionEcu WORN · odds 38"]:::mild
  S6["Tired radiator<br/>cooling POOR · odds 35"]:::mid
  S0 -->|"Coolant check<br/>sweet and green · 10m"| S1
  S0 -->|"Coolant check<br/>plain water · 10m"| S2
  S1 -->|"Compression test<br/>even and healthy · 25m"| S3
  S1 -->|"Compression test<br/>down on two · 25m"| S4
  S2 -->|"Warm idle watch<br/>positive · 20m"| S5
  S2 -->|"Warm idle watch<br/>negative · 20m"| S6
  S2 -->|"Rad flow feel<br/>positive · 5m"| S6
  S2 -->|"Rad flow feel<br/>negative · 5m"| S5
  W0("tells you nothing here:<br/>Warm idle watch 20m<br/>Rad flow feel 5m<br/>Hose squeeze 5m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Compression test 25m<br/>Hose squeeze 5m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### wheel-vibration

Vibration through the wheel, builds with road speed.

```mermaid
flowchart TD
  SYM_wheel_vibration["wheel-vibration<br/>Vibration through the wheel, builds with road speed."]
  T_wheel_balance_check["wheel-balance-check<br/>15m"]
  SYM_wheel_vibration --> T_wheel_balance_check
  T_wheel_balance_check --> T_wheel_balance_check_G0(("Outcome A"))
  FM_worn_tyres["worn-tyres<br/>(worn)"]:::mild
  T_wheel_balance_check_G0 -->|"w=55"| FM_worn_tyres
  T_wheel_balance_check --> T_wheel_balance_check_G1(("Outcome B"))
  FM_buckled_rim["buckled-rim<br/>(poor)"]:::mid
  T_wheel_balance_check_G1 -->|"w=30"| FM_buckled_rim
  FM_worn_driveshaft["worn-driveshaft<br/>(poor)"]:::mid
  T_wheel_balance_check_G1 -->|"w=15"| FM_worn_driveshaft
  T_undercarriage_look["undercarriage-look<br/>15m"]
  SYM_wheel_vibration --> T_undercarriage_look
  T_undercarriage_look --> T_undercarriage_look_G0(("Outcome A"))
  T_undercarriage_look_G0 -->|"w=15"| FM_worn_driveshaft
  T_undercarriage_look --> T_undercarriage_look_G1(("Outcome B"))
  T_undercarriage_look_G1 -->|"w=55"| FM_worn_tyres
  T_undercarriage_look_G1 -->|"w=30"| FM_buckled_rim
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
```

### diff-whine

Whines on the overrun. Quiet under power.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Chewed ring pinion<br/>Worn diff bearings"]:::state
  S2["Collapsed centre bearing<br/>Worn wheel bearing"]:::state
  S3["Chewed ring pinion<br/>differential SCRAP · odds 15"]:::grenade
  S4["Worn diff bearings<br/>differential WORN · odds 50"]:::mild
  S5["Collapsed centre bearing<br/>driveline POOR · odds 20"]:::mid
  S6["Worn wheel bearing<br/>driveline WORN · odds 15"]:::mild
  S0 -->|"Coast and load listen<br/>positive · 5m"| S1
  S0 -->|"Coast and load listen<br/>negative · 5m"| S2
  S1 -->|"Gearbox oil check<br/>low, thin, dark · 15m"| S3
  S1 -->|"Gearbox oil check<br/>full and clean · 15m"| S4
  S2 -->|"Undercarriage look<br/>seam is rotten · 15m"| S5
  S2 -->|"Undercarriage look<br/>seam solid · 15m"| S6
  S2 -->|"Spin the hub<br/>positive · 5m"| S6
  S2 -->|"Spin the hub<br/>negative · 5m"| S5
  W0("tells you nothing here:<br/>Undercarriage look 15m<br/>Spin the hub 5m<br/>Stethoscope 15m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Gearbox oil check 15m<br/>Stethoscope 15m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### sagging-spring

Sits lower than it should. Wallows over rough tarmac.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Perished spring seats<br/>Sagging springs"]:::state
  S2["Broken spring<br/>Rotted strut turret"]:::state
  S3["Perished spring seats<br/>springs FINE · odds 15"]:::gem
  S4["Sagging springs<br/>springs WORN · odds 50"]:::mild
  S5["Broken spring<br/>springs POOR · odds 22"]:::mid
  S6["Rotted strut turret<br/>chassis SCRAP · odds 13"]:::grenade
  S0 -->|"Ride height check<br/>positive · 10m"| S1
  S0 -->|"Ride height check<br/>negative · 10m"| S2
  S1 -->|"Seat poke<br/>positive · 5m"| S3
  S1 -->|"Seat poke<br/>negative · 5m"| S4
  S2 -->|"Wheel off look<br/>positive · 15m"| S5
  S2 -->|"Wheel off look<br/>negative · 15m"| S6
  S2 -->|"Undercarriage look<br/>seam is rotten · 15m"| S6
  S2 -->|"Undercarriage look<br/>seam solid · 15m"| S5
  W0("tells you nothing here:<br/>Wheel off look 15m<br/>Undercarriage look 15m<br/>Bounce test 10m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Seat poke 5m<br/>Bounce test 10m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### quarter-panel-filler

Faint filler line along a rear quarter panel.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Panel respray<br/>Tired lacquer"]:::state
  S2["Rust patch<br/>Structural rail repair"]:::state
  S3["Tired lacquer<br/>paint FINE · odds 15"]:::gem
  S4["Panel respray<br/>panels WORN · odds 45"]:::mild
  S5["Rust patch<br/>panels POOR · odds 25"]:::mid
  S6["Structural rail repair<br/>chassis SCRAP · odds 15"]:::grenade
  S0 -->|"Sight down the panel<br/>positive · 5m"| S1
  S0 -->|"Sight down the panel<br/>negative · 5m"| S2
  S1 -->|"Polish spot test<br/>positive · 10m"| S3
  S1 -->|"Polish spot test<br/>negative · 10m"| S4
  S2 -->|"Magnet check<br/>furred with metal · 10m"| S5
  S2 -->|"Magnet check<br/>magnet clean · 10m"| S6
  S2 -->|"Undercarriage look<br/>seam is rotten · 15m"| S6
  S2 -->|"Undercarriage look<br/>seam solid · 15m"| S5
  W0("tells you nothing here:<br/>Magnet check 10m<br/>Undercarriage look 15m<br/>Open the boot 5m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Polish spot test 10m<br/>Open the boot 5m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### damp-passenger-footwell

Carpet's damp on the passenger side.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Heater matrix weep<br/>Perished grommet<br/>Split sunroof drain"]:::state
  S2["Blocked scuttle drain<br/>Rotten bulkhead seam"]:::state
  S3["Heater matrix weep<br/>cooling WORN · odds 38"]:::mild
  S4["Perished grommet<br/>Split sunroof drain"]:::state
  S5["Blocked scuttle drain<br/>underbody WORN · odds 20"]:::mild
  S6["Rotten bulkhead seam<br/>chassis SCRAP · odds 18"]:::grenade
  S7["Split sunroof drain<br/>dashGauges POOR · odds 10"]:::mid
  S8["Perished grommet<br/>chassis POOR · odds 14"]:::mid
  S0 -->|"Trace the wet<br/>comes in up top · 5m"| S1
  S0 -->|"Trace the wet<br/>pools down low · 5m"| S2
  S1 -->|"Coolant check<br/>sweet and green · 10m"| S3
  S1 -->|"Coolant check<br/>plain water · 10m"| S4
  S2 -->|"Scuttle drain poke<br/>leaf water gushes · 10m"| S5
  S2 -->|"Scuttle drain poke<br/>drain runs clear · 10m"| S6
  S2 -->|"Undercarriage look<br/>seam is rotten · 15m"| S6
  S2 -->|"Undercarriage look<br/>seam solid · 15m"| S5
  S4 -->|"Hose the roof<br/>A-pillar runs wet · 10m"| S7
  S4 -->|"Hose the roof<br/>pillars dry · 10m"| S8
  W0("tells you nothing here:<br/>Scuttle drain poke 10m<br/>Undercarriage look 15m<br/>Carpet lift 5m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Coolant check 10m<br/>Carpet lift 5m"):::waste
  S2 -.-> W1
  W2("tells you nothing here:<br/>Scuttle drain poke 10m<br/>Undercarriage look 15m<br/>Carpet lift 5m"):::waste
  S4 -.-> W2
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### exhaust-rasp

Deep rasp under load, quiet at idle.

```mermaid
flowchart TD
  SYM_exhaust_rasp["exhaust-rasp<br/>Deep rasp under load, quiet at idle."]
  T_stethoscope["stethoscope<br/>15m"]
  SYM_exhaust_rasp --> T_stethoscope
  T_stethoscope --> T_stethoscope_G0(("Outcome A"))
  FM_blown_flex_joint["blown-flex-joint<br/>(worn)"]:::mild
  T_stethoscope_G0 -->|"w=60"| FM_blown_flex_joint
  T_stethoscope --> T_stethoscope_G1(("Outcome B"))
  FM_cracked_manifold["cracked-manifold<br/>(poor)"]:::mid
  T_stethoscope_G1 -->|"w=40"| FM_cracked_manifold
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
```

### oil-pressure-flutter

Oil light flickers at hot idle. Goes out with revs.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Thin cheap oil<br/>Tired sender"]:::state
  S2["Worn main bearings<br/>Worn oil pump"]:::state
  S3["Thin cheap oil<br/>internals FINE · odds 15"]:::gem
  S4["Tired sender<br/>dashGauges WORN · odds 50"]:::mild
  S5["Worn main bearings<br/>internals SCRAP · odds 15"]:::grenade
  S6["Worn oil pump<br/>internals POOR · odds 20"]:::mid
  S0 -->|"Warm gauge watch<br/>positive · 5m"| S1
  S0 -->|"Warm gauge watch<br/>negative · 5m"| S2
  S1 -->|"Dipstick check<br/>positive · 5m"| S3
  S1 -->|"Dipstick check<br/>negative · 5m"| S4
  S2 -->|"Oil pressure check<br/>positive · 20m"| S5
  S2 -->|"Oil pressure check<br/>negative · 20m"| S6
  W0("tells you nothing here:<br/>Oil pressure check 20m<br/>Stethoscope 15m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Dipstick check 5m<br/>Stethoscope 15m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### hesitates-under-load

Hesitates and flat-spots under hard acceleration. Smooth enough at a steady cruise.

```mermaid
%%{init: {'theme':'dark','themeVariables':{'fontFamily':'monospace','fontSize':'14px'},'flowchart':{'useMaxWidth':false,'nodeSpacing':22,'rankSpacing':42,'wrappingWidth':160}}}%%
flowchart TD
  S0["THE DOUBT<br/>every cause still live"]:::state
  S1["Clogged fuel filter<br/>Stale fuel"]:::state
  S2["Jumped timing chain<br/>Stretched timing chain"]:::state
  S3["Clogged fuel filter<br/>fuelSystem WORN · odds 50"]:::mild
  S4["Stale fuel<br/>fuelSystem FINE · odds 15"]:::gem
  S5["Jumped timing chain<br/>headValvetrain SCRAP · odds 12"]:::grenade
  S6["Stretched timing chain<br/>camsTiming POOR · odds 23"]:::mid
  S0 -->|"Rev response watch<br/>positive · 5m"| S1
  S0 -->|"Rev response watch<br/>negative · 5m"| S2
  S1 -->|"Fuel pressure check<br/>positive · 15m"| S3
  S1 -->|"Fuel pressure check<br/>negative · 15m"| S4
  S1 -->|"Fuel sniff<br/>positive · 5m"| S4
  S1 -->|"Fuel sniff<br/>negative · 5m"| S3
  S2 -->|"Compression test<br/>even and healthy · 25m"| S5
  S2 -->|"Compression test<br/>down on two · 25m"| S6
  W0("tells you nothing here:<br/>Compression test 25m<br/>Pull a plug 5m"):::waste
  S1 -.-> W0
  W1("tells you nothing here:<br/>Fuel pressure check 15m<br/>Fuel sniff 5m<br/>Pull a plug 5m"):::waste
  S2 -.-> W1
  classDef state fill:#1b2130,stroke:#5ee0f7,color:#cfd6e4
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
  classDef waste fill:#151a23,stroke:#79839a,color:#79839a,stroke-dasharray:4 4
```

### steering-wander

Steering feels vague, wants constant small corrections at speed.

```mermaid
flowchart TD
  SYM_steering_wander["steering-wander<br/>Steering feels vague, wants constant small corrections at speed."]
  T_steering_linkage_check["steering-linkage-check<br/>10m"]
  SYM_steering_wander --> T_steering_linkage_check
  T_steering_linkage_check --> T_steering_linkage_check_G0(("Outcome A"))
  FM_tired_track_rod_ends["tired-track-rod-ends<br/>(worn)"]:::mild
  T_steering_linkage_check_G0 -->|"w=60"| FM_tired_track_rod_ends
  T_steering_linkage_check --> T_steering_linkage_check_G1(("Outcome B"))
  FM_worn_rack["worn-rack<br/>(poor)"]:::mid
  T_steering_linkage_check_G1 -->|"w=40"| FM_worn_rack
  classDef grenade fill:#2a1420,stroke:#ff5470,color:#ff9db0
  classDef gem fill:#14261b,stroke:#7ed491,color:#a9e8bb
  classDef mid fill:#2a2214,stroke:#ffb454,color:#ffd8a1
  classDef mild fill:#1b2130,stroke:#79839a,color:#aab3c5
```

# Sprint 224: repair refactor content foundations

**Status:** Complete, ready for review. Not committed.
**Arc:** `repair-refactor-arc.md` sprint 1 of 9. Spec: `docs/design/systems/repair-refactor-spec.md`.
**Scope:** content and schemas only. Everything here is ADDITIVE to the sim (new keys and
files land beside the old; the sim does not read them yet) except the tool prices, which
change in place. No sim source file is touched except one probe retarget listed in task 7.

## Reuse analysis (directive 16)

New mechanisms: `workbench.json` (benches, shadow-board tools, step recipes) and its Zod
schema; the `underCar` taxonomy flag; the `toolHire`, `lift`, `repairJobs`, and
`energyPerStepPoints` economy keys. Existing mechanisms reused: `ComponentIdSchema` and
`CarPartIdSchema` key every new map; `ToolLinesSchema`/`ToolShopsSchema` and their files
keep their exact structure (values change only); `ReputationTierSchema` gates the lift;
the approval-gate hash mechanism extends to one more file; the content spelling guard's
`findOffenses` pattern extends to the new copy. Nothing existing is retired this sprint.

## Tasks

### 1. `packages/content/data/workbench.json` (new file)

Create with exactly this content (formatted by Prettier). The `benches` tool lists are the
spec's section 7.5 boards; the `recipes` are the spec's section 9 mapping with locked tool
ids. Copy strings are verbatim from the spec and must not be reworded.

```json
{
  "benchByGroup": {
    "engine": "engine-bench",
    "drivetrain": "chassis-bench",
    "suspension": "chassis-bench",
    "wheels": "chassis-bench",
    "body": "body-trim-bench",
    "interior": "body-trim-bench"
  },
  "benches": [
    {
      "id": "engine-bench",
      "displayName": "Engine bench",
      "zones": {
        "clean": {
          "tier1": [
            { "id": "degreaser-tin", "displayName": "Degreaser tin" },
            { "id": "parts-brush", "displayName": "Parts brush" },
            { "id": "carb-cleaner", "displayName": "Carb & contact cleaner" }
          ],
          "tier2": [
            { "id": "parts-washer", "displayName": "Parts washer" },
            { "id": "ultrasonic-tub", "displayName": "Ultrasonic tub" }
          ],
          "shop": [{ "id": "hot-tank", "displayName": "Hot tank" }]
        },
        "fit": {
          "tier1": [{ "id": "spanner-roll", "displayName": "Spanner roll" }],
          "tier2": [
            { "id": "torque-wrench", "displayName": "Torque wrench" },
            { "id": "press-tray", "displayName": "Press tool tray" }
          ],
          "shop": [{ "id": "assembly-table", "displayName": "Clean assembly table" }]
        },
        "cut": {
          "tier1": [],
          "tier2": [
            { "id": "flex-hone", "displayName": "Flex-hone" },
            { "id": "lapping-stick", "displayName": "Lapping stick" }
          ],
          "shop": [
            { "id": "boring-bar", "displayName": "Boring bar" },
            { "id": "valve-grinder", "displayName": "Valve grinder" },
            { "id": "die-grinder", "displayName": "Die grinder" }
          ]
        },
        "join": {
          "tier1": [],
          "tier2": [{ "id": "soldering-iron", "displayName": "Soldering iron" }],
          "shop": []
        },
        "measure": {
          "tier1": [
            { "id": "timing-light", "displayName": "Timing light" },
            { "id": "feeler-gauges", "displayName": "Feeler gauges" }
          ],
          "tier2": [
            { "id": "micrometer", "displayName": "Micrometer" },
            { "id": "plastigauge", "displayName": "Plastigauge" }
          ],
          "shop": [
            { "id": "degree-wheel", "displayName": "Degree wheel" },
            { "id": "dial-gauge", "displayName": "Dial gauge" },
            { "id": "balancing-rig", "displayName": "Balancing rig" },
            { "id": "vacuum-gauges", "displayName": "Vacuum gauges" },
            { "id": "flow-bench", "displayName": "Flow bench" },
            { "id": "pressure-tester", "displayName": "Pressure tester" },
            { "id": "test-rig", "displayName": "Test rig" }
          ]
        }
      }
    },
    {
      "id": "chassis-bench",
      "displayName": "Chassis bench",
      "zones": {
        "clean": {
          "tier1": [
            { "id": "solvent-bucket", "displayName": "Solvent bucket" },
            { "id": "wire-brush", "displayName": "Wire brush" },
            { "id": "grease-gun", "displayName": "Grease gun" },
            { "id": "bleed-bottle", "displayName": "Bleed bottle" }
          ],
          "tier2": [
            { "id": "dip-tank", "displayName": "Dip tank" },
            { "id": "flush-rig", "displayName": "Flush rig" }
          ],
          "shop": []
        },
        "fit": {
          "tier1": [
            { "id": "breaker-bar", "displayName": "Breaker bar" },
            { "id": "drifts", "displayName": "Drifts" },
            { "id": "spring-compressors", "displayName": "Spring compressors" },
            { "id": "ball-joint-splitter", "displayName": "Ball joint splitter" }
          ],
          "tier2": [
            { "id": "floor-press", "displayName": "Floor press" },
            { "id": "pullers", "displayName": "Pullers" },
            { "id": "rebuild-tooling", "displayName": "Rebuild tooling" },
            { "id": "seal-drivers", "displayName": "Seal drivers" }
          ],
          "shop": []
        },
        "cut": {
          "tier1": [
            { "id": "flat-file", "displayName": "Flat file" },
            { "id": "wet-and-dry", "displayName": "Wet-and-dry" }
          ],
          "tier2": [{ "id": "straightener-ram", "displayName": "Rim straightener ram" }],
          "shop": [
            { "id": "polishing-lathe", "displayName": "Polishing lathe" },
            { "id": "blast-cabinet", "displayName": "Blast cabinet" },
            { "id": "powder-oven", "displayName": "Powder oven" }
          ]
        },
        "join": {
          "tier1": [],
          "tier2": [],
          "shop": [{ "id": "tig-welder", "displayName": "TIG welder" }]
        },
        "measure": {
          "tier1": [],
          "tier2": [
            { "id": "torque-wrench", "displayName": "Torque wrench" },
            { "id": "dial-gauge", "displayName": "Dial gauge" },
            { "id": "backlash-kit", "displayName": "Backlash kit" }
          ],
          "shop": [
            { "id": "corner-scales", "displayName": "Corner scales" },
            { "id": "shock-dyno", "displayName": "Shock dyno" },
            { "id": "propshaft-balancer", "displayName": "Propshaft balancer" },
            { "id": "nitrogen-rig", "displayName": "Nitrogen rig" },
            { "id": "string-gauges", "displayName": "String gauges" },
            { "id": "marking-compound", "displayName": "Marking compound" },
            { "id": "flaring-tool", "displayName": "Flaring tool" }
          ]
        }
      }
    },
    {
      "id": "body-trim-bench",
      "displayName": "Body & trim corner",
      "zones": {
        "clean": {
          "tier1": [
            { "id": "wire-wheel", "displayName": "Drill and wire wheel" },
            { "id": "rust-converter", "displayName": "Rust converter" },
            { "id": "upholstery-cleaner", "displayName": "Upholstery cleaner" }
          ],
          "tier2": [{ "id": "da-sander", "displayName": "DA sander" }],
          "shop": [{ "id": "underseal-gun", "displayName": "Underseal gun" }]
        },
        "fit": {
          "tier1": [
            { "id": "trim-wedge", "displayName": "Trim wedge" },
            { "id": "hog-ring-pliers", "displayName": "Hog-ring pliers" },
            { "id": "hardware-tray", "displayName": "Hardware tray" }
          ],
          "tier2": [
            { "id": "staple-gun", "displayName": "Staple gun" },
            { "id": "foam-kit", "displayName": "Foam kit" }
          ],
          "shop": [{ "id": "fabric-rolls", "displayName": "Fabric rolls" }]
        },
        "cut": {
          "tier1": [
            { "id": "hammer-and-dolly", "displayName": "Hammer and dolly" },
            { "id": "filler-board", "displayName": "Filler board" }
          ],
          "tier2": [
            { "id": "angle-grinder", "displayName": "Angle grinder" },
            { "id": "edge-setter", "displayName": "Edge setter" }
          ],
          "shop": [{ "id": "pull-jig", "displayName": "Pull jig" }]
        },
        "join": {
          "tier1": [
            { "id": "hot-stapler", "displayName": "Hot stapler" },
            { "id": "needle-and-thread", "displayName": "Needle and thread" }
          ],
          "tier2": [
            { "id": "mig-welder", "displayName": "MIG welder" },
            { "id": "fibreglass-kit", "displayName": "Fibreglass kit" },
            { "id": "sewing-machine", "displayName": "Sewing machine" },
            { "id": "soldering-iron", "displayName": "Soldering iron" },
            { "id": "heat-gun", "displayName": "Heat gun" }
          ],
          "shop": [
            { "id": "seam-rig", "displayName": "Seam-welding rig" },
            { "id": "spray-booth", "displayName": "Spray booth" }
          ]
        },
        "measure": {
          "tier1": [],
          "tier2": [{ "id": "multimeter", "displayName": "Multimeter" }],
          "shop": [
            { "id": "jig-arms", "displayName": "Jig measuring arms" },
            { "id": "calibration-rig", "displayName": "Gauge calibration rig" },
            { "id": "polishing-wheel", "displayName": "Polishing wheel" }
          ]
        }
      }
    }
  ],
  "recipes": {
    "block": {
      "service": [
        { "tool": "degreaser-tin", "copy": "Degrease it in the bay" },
        { "tool": "spanner-roll", "copy": "Chase the threads, drive in new core plugs" }
      ],
      "rebuild": [
        { "tool": "parts-washer", "copy": "Through the parts washer" },
        { "tool": "flex-hone", "copy": "Hone the cylinder bores" },
        { "tool": "micrometer", "copy": "Straight-edge the deck" }
      ],
      "restore": [
        { "tool": "boring-bar", "copy": "Rebore and line-hone" },
        { "tool": "dial-gauge", "copy": "Blueprint every clearance" }
      ]
    },
    "internals": {
      "service": [
        { "tool": "degreaser-tin", "copy": "Clean and inspect" },
        { "tool": "spanner-roll", "copy": "Drop the sump, fit new bearing shells" }
      ],
      "rebuild": [
        { "tool": "lapping-stick", "copy": "Polish the crank journals" },
        { "tool": "torque-wrench", "copy": "Fresh piston rings" },
        { "tool": "plastigauge", "copy": "Plastigauge the clearances" }
      ],
      "restore": [
        { "tool": "balancing-rig", "copy": "Balance the rotating assembly" },
        { "tool": "torque-wrench", "copy": "Torque to blueprint spec" }
      ]
    },
    "headValvetrain": {
      "service": [
        { "tool": "degreaser-tin", "copy": "Decoke the chambers" },
        { "tool": "spanner-roll", "copy": "New stem seals with the rope trick" }
      ],
      "rebuild": [
        { "tool": "lapping-stick", "copy": "Lap the valves in by hand" },
        { "tool": "press-tray", "copy": "New valve springs" }
      ],
      "restore": [
        { "tool": "valve-grinder", "copy": "Skim the face, three-angle grind" },
        { "tool": "dial-gauge", "copy": "Set the seat widths" }
      ]
    },
    "camsTiming": {
      "service": [
        { "tool": "spanner-roll", "copy": "New belt and tensioner over the bay" },
        { "tool": "timing-light", "copy": "Set the tension, check it with the light" }
      ],
      "rebuild": [
        { "tool": "feeler-gauges", "copy": "Shim the valve clearances" },
        { "tool": "lapping-stick", "copy": "Polish the cam lobes" }
      ],
      "restore": [{ "tool": "degree-wheel", "copy": "Degree the cams in on the wheel" }]
    },
    "intake": {
      "service": [
        { "tool": "carb-cleaner", "copy": "Blast it out with carb cleaner" },
        { "tool": "spanner-roll", "copy": "New air filter" }
      ],
      "rebuild": [
        { "tool": "ultrasonic-tub", "copy": "Ultrasonic the idle valve" },
        { "tool": "press-tray", "copy": "Rebuild the throttle body, new gaskets" }
      ],
      "restore": [
        { "tool": "die-grinder", "copy": "Port-match and polish the runners" },
        { "tool": "vacuum-gauges", "copy": "Sync the throttles" }
      ]
    },
    "exhaust": {
      "service": [
        { "tool": "wire-brush", "bench": "chassis-bench", "copy": "Wire-brush the joints" },
        { "tool": "spanner-roll", "copy": "Paste and clamp the leaks" }
      ],
      "rebuild": [
        {
          "tool": "mig-welder",
          "bench": "body-trim-bench",
          "requiresMachine": true,
          "copy": "Cut out the rot, MIG in new pipe"
        },
        { "tool": "spanner-roll", "copy": "Refit on new rubbers" }
      ],
      "restore": [
        { "tool": "torque-wrench", "copy": "New gaskets and hangers throughout" },
        { "tool": "degreaser-tin", "copy": "Wrap it, heat-paint the tails" }
      ]
    },
    "fuelSystem": {
      "service": [
        { "tool": "degreaser-tin", "copy": "Drain the stale fuel" },
        { "tool": "spanner-roll", "copy": "New filter" }
      ],
      "rebuild": [
        { "tool": "ultrasonic-tub", "copy": "Ultrasonic the injectors" },
        { "tool": "press-tray", "copy": "New pump strainer" }
      ],
      "restore": [
        { "tool": "flow-bench", "copy": "Flow-test and balance the injectors" },
        { "tool": "torque-wrench", "copy": "Fresh lines and a new regulator" }
      ]
    },
    "ignitionEcu": {
      "service": [
        { "tool": "spanner-roll", "copy": "New plugs and leads" },
        { "tool": "carb-cleaner", "copy": "Contact-clean the connectors" }
      ],
      "rebuild": [
        { "tool": "soldering-iron", "copy": "Re-solder the cracked joints" },
        { "tool": "soldering-iron", "copy": "New capacitors on the board" }
      ],
      "restore": [
        { "tool": "test-rig", "copy": "Bench-test the board, set base timing" },
        { "tool": "spanner-roll", "copy": "New relays" }
      ]
    },
    "cooling": {
      "service": [
        { "tool": "degreaser-tin", "copy": "Flush the system" },
        { "tool": "spanner-roll", "copy": "Fresh coolant, new hoses" }
      ],
      "rebuild": [
        { "tool": "parts-washer", "copy": "Rod out the radiator core" },
        { "tool": "press-tray", "copy": "New stat and water pump" }
      ],
      "restore": [
        { "tool": "torque-wrench", "copy": "New core, silicone hoses" },
        { "tool": "pressure-tester", "copy": "Pressure-test the lot" }
      ]
    },
    "forcedInduction": {
      "service": [
        { "tool": "degreaser-tin", "copy": "Clean the compressor housing" },
        { "tool": "spanner-roll", "copy": "Free off the wastegate actuator" }
      ],
      "rebuild": [
        { "tool": "parts-washer", "copy": "Strip and wash the housings" },
        { "tool": "press-tray", "copy": "Rebuild the CHRA, new seals and bearings" }
      ],
      "restore": [
        { "tool": "balancing-rig", "copy": "Balance the shaft assembly" },
        { "tool": "die-grinder", "copy": "Port the wastegate" }
      ]
    },
    "gearbox": {
      "service": [
        { "tool": "solvent-bucket", "copy": "Drain and refill the oil" },
        { "tool": "breaker-bar", "copy": "New selector bushes from below" }
      ],
      "rebuild": [
        { "tool": "dip-tank", "copy": "Strip and wash the case" },
        { "tool": "floor-press", "copy": "Press in new synchros and bearings" }
      ],
      "restore": [
        { "tool": "backlash-kit", "copy": "Shim the shafts to spec" },
        { "tool": "seal-drivers", "copy": "New seals throughout" }
      ]
    },
    "differential": {
      "service": [
        { "tool": "solvent-bucket", "copy": "Fresh oil" },
        { "tool": "drifts", "copy": "New output seals" }
      ],
      "rebuild": [
        { "tool": "floor-press", "copy": "Press in new carrier bearings" },
        { "tool": "torque-wrench", "copy": "Reset the preload" }
      ],
      "restore": [
        { "tool": "marking-compound", "copy": "Set backlash and pinion depth with marking paste" }
      ]
    },
    "driveline": {
      "service": [
        { "tool": "grease-gun", "copy": "Grease the joints" },
        { "tool": "drifts", "copy": "New boots" }
      ],
      "rebuild": [
        { "tool": "floor-press", "copy": "Press in new UJs and a centre bearing" }
      ],
      "restore": [
        { "tool": "propshaft-balancer", "copy": "Balance the propshaft" },
        { "tool": "torque-wrench", "copy": "New hardware throughout" }
      ]
    },
    "dampers": {
      "service": [
        { "tool": "solvent-bucket", "copy": "Clean the shafts" },
        { "tool": "spring-compressors", "copy": "New bump stops and top mounts" }
      ],
      "rebuild": [
        { "tool": "rebuild-tooling", "copy": "Strip and reseal" },
        { "tool": "dip-tank", "copy": "Refill with fresh oil" }
      ],
      "restore": [{ "tool": "nitrogen-rig", "copy": "Re-gas, match the pair on the dyno" }]
    },
    "springs": {
      "service": [
        { "tool": "wire-brush", "copy": "Wire-brush and paint" },
        { "tool": "spring-compressors", "copy": "New rubber isolators" }
      ],
      "rebuild": [
        { "tool": "dial-gauge", "copy": "Match free lengths across the axle" },
        { "tool": "spring-compressors", "copy": "Re-seat them properly" }
      ],
      "restore": [
        { "tool": "blast-cabinet", "copy": "Shot-peen and powder coat" },
        { "tool": "corner-scales", "copy": "Corner-weight the car" }
      ]
    },
    "antiRollBars": {
      "service": [{ "tool": "breaker-bar", "copy": "New bushes" }],
      "rebuild": [
        { "tool": "breaker-bar", "copy": "New drop links" },
        { "tool": "solvent-bucket", "copy": "Clean and paint the bar" }
      ],
      "restore": [
        { "tool": "breaker-bar", "copy": "Poly bushes throughout" },
        { "tool": "torque-wrench", "copy": "Set the preload, torque to spec" }
      ]
    },
    "steering": {
      "service": [
        { "tool": "ball-joint-splitter", "copy": "New tie rod ends" },
        { "tool": "solvent-bucket", "copy": "Top up the fluid" }
      ],
      "rebuild": [
        { "tool": "rebuild-tooling", "copy": "Rebuild the rack, new seals" },
        { "tool": "flush-rig", "copy": "Flush the system" }
      ],
      "restore": [
        { "tool": "string-gauges", "copy": "Set the rack preload, string-align on the gauges" }
      ]
    },
    "brakeCalipersLines": {
      "service": [
        { "tool": "solvent-bucket", "copy": "Clean and grease the slide pins" },
        { "tool": "bleed-bottle", "copy": "Bleed the fluid through" }
      ],
      "rebuild": [
        { "tool": "rebuild-tooling", "copy": "Rebuild with new pistons and seals" },
        { "tool": "flush-rig", "copy": "Full fluid flush" }
      ],
      "restore": [
        { "tool": "flaring-tool", "copy": "New hard and braided lines" },
        { "tool": "blast-cabinet", "copy": "Refinish the calipers" }
      ]
    },
    "rims": {
      "service": [
        { "tool": "solvent-bucket", "copy": "Deep clean the brake dust" },
        { "tool": "flat-file", "copy": "File back the kerb rash" }
      ],
      "rebuild": [{ "tool": "straightener-ram", "copy": "Straighten the buckles on the ram" }],
      "restore": [
        { "tool": "tig-welder", "requiresMachine": true, "copy": "TIG the cracks" },
        { "tool": "polishing-lathe", "copy": "Strip, polish the lips, powder coat" },
        { "tool": "dial-gauge", "copy": "Spin-check for run-out" }
      ]
    },
    "chassis": {
      "service": [{ "tool": "wire-wheel", "copy": "Wire-brush the rust, treat with converter" }],
      "rebuild": [
        { "tool": "angle-grinder", "copy": "Cut out the rot" },
        { "tool": "mig-welder", "requiresMachine": true, "copy": "Weld in repair sections" }
      ],
      "restore": [
        { "tool": "seam-rig", "requiresMachine": true, "copy": "Seam-weld the shell" },
        { "tool": "jig-arms", "copy": "Measure it on the jig" },
        { "tool": "underseal-gun", "copy": "Underseal" }
      ]
    },
    "aero": {
      "service": [
        { "tool": "hot-stapler", "copy": "Hot-staple the cracks" },
        { "tool": "hardware-tray", "copy": "Re-tab the mounts" }
      ],
      "rebuild": [
        { "tool": "fibreglass-kit", "copy": "Glass the splitters and wings" },
        { "tool": "wire-wheel", "copy": "Re-drill the mounts" }
      ],
      "restore": [
        { "tool": "spray-booth", "copy": "Sand and refinish in the booth" },
        { "tool": "hardware-tray", "copy": "Fresh hardware, line up the gaps" }
      ]
    },
    "seats": {
      "service": [
        { "tool": "upholstery-cleaner", "copy": "Deep clean" },
        { "tool": "hog-ring-pliers", "copy": "Re-tension the springs, free the rails" }
      ],
      "rebuild": [
        { "tool": "staple-gun", "copy": "Rebuild the bolster foam" },
        { "tool": "sewing-machine", "copy": "Stitch the tears" }
      ],
      "restore": [
        { "tool": "fabric-rolls", "copy": "Retrim in period cloth" },
        { "tool": "hardware-tray", "copy": "Rebuild the recliner" }
      ]
    },
    "dashGauges": {
      "service": [
        { "tool": "upholstery-cleaner", "copy": "Clean it up, chase the rattles" },
        { "tool": "trim-wedge", "copy": "New bulbs" }
      ],
      "rebuild": [
        { "tool": "soldering-iron", "copy": "Re-solder the cluster" },
        { "tool": "heat-gun", "copy": "Repair the dash cracks" }
      ],
      "restore": [
        { "tool": "calibration-rig", "copy": "Recalibrate the gauges" },
        { "tool": "polishing-wheel", "copy": "Polish the lenses, restore the trim" }
      ]
    }
  }
}
```

Recipe id notes, locked (do not revisit during implementation): a step names ONE tool;
where the spec's copy names two ("Backlash kit + dial gauge"), the id is the first-named
tool and the copy carries both. `exhaust.service` step 1 borrows the chassis bench's wire
brush via a `bench` override (the engine board has no wire brush); `exhaust.rebuild` step 1
borrows the body corner's MIG per the spec. The four `requiresMachine: true` steps are the
spec's four welding steps, exactly.

### 2. `packages/content/src/workbench.ts` (new file)

Zod schemas plus exported types. Shape:

- `BenchIdSchema = z.enum(['engine-bench', 'chassis-bench', 'body-trim-bench'])`.
- `BenchZoneSchema = z.enum(['clean', 'fit', 'cut', 'join', 'measure'])`.
- `BenchToolSchema = z.object({ id: z.string().min(1), displayName: z.string().min(1) }).strict()`.
- `BenchZoneToolsSchema = z.object({ tier1, tier2, shop: z.array(BenchToolSchema).default([]) }).strict()`.
- `BenchSchema = z.object({ id: BenchIdSchema, displayName: z.string().min(1), zones: z.record(BenchZoneSchema, BenchZoneToolsSchema) }).strict()` with a refine: all five zones present.
- `RecipeStepSchema = z.object({ tool: z.string().min(1), copy: z.string().min(1), bench: BenchIdSchema.optional(), requiresMachine: z.boolean().default(false) }).strict()`.
- `PartRecipesSchema = z.object({ service, rebuild, restore: z.array(RecipeStepSchema).min(1) }).strict()` (all three jobs required).
- `WorkbenchContentSchema = z.object({ benchByGroup: z.record(ComponentIdSchema, BenchIdSchema), benches: z.array(BenchSchema).length(3), recipes: z.record(CarPartIdSchema, PartRecipesSchema) }).strict()` with refines:
  - `benchByGroup` covers all six `ComponentIdSchema.options`.
  - bench ids unique and exactly the three enum values.
  - every recipe step's tool id exists on its resolved bench (the step's `bench` override, else `benchByGroup` of the part's group looked up via the taxonomy; import the taxonomy entries for the lookup the same way `data.ts` composes other cross-file checks; if the composition is cleaner as a test than a refine, put it in the test file of task 8 instead and keep the schema self-contained).
  - `requiresMachine` steps' tools are tier2 or shop tools, never tier1.
- Export types `BenchId`, `BenchZone`, `BenchTool`, `RecipeStep`, `PartRecipes`, `WorkbenchContent`, and a `JobKind3 = 'service' | 'rebuild' | 'restore'` type alias named `RepairJobKindSchema = z.enum(['service', 'rebuild', 'restore'])` (this enum is the one the sim imports from sprint 225 onward; it lives here, in content, beside the recipes it indexes).
- Wire the file into `packages/content/src/data.ts` and `index.ts` exactly the way `toolLines.json` is loaded and exported (parse with the schema at load, export `WORKBENCH` or the local naming convention used for the other data exports; follow the existing pattern, do not invent a new one).

### 3. `packages/content/data/parts-taxonomy.json`: add `underCar`

Add `"underCar": true` to exactly these 13 entries: `exhaust`, `gearbox`, `clutch`,
`differential`, `driveline`, `dampers`, `springs`, `antiRollBars`, `steering`,
`brakePadsDiscs`, `brakeCalipersLines`, `rims`, `tyres`. No other entry gains the key.
In `packages/content/src/carPart.ts` add to `CarPartTaxonomyEntryContentSchema`:
`underCar: z.boolean().default(false)` with a one-line doc comment: "Worked from under
the car: the two-post lift's energy discount applies." Do NOT touch `machineGate` this
sprint (it retires in sprint 231).

### 4. `packages/content/data/economy.json`: additive keys (values from the lever ledger R1)

Add, without touching any existing key:

- Under `energy`: `"energyPerStepPoints": 4`.
- New top-level block after `machineShopAssist`:
  ```json
  "toolHire": {
    "feeYenByGroup": {
      "engine": 15000, "drivetrain": 13750, "suspension": 7500,
      "wheels": 6250, "body": 10000, "interior": 7000
    },
    "amortisationDays": 40,
    "maxHiredLinesPerDay": 1,
    "slogMultiplier": 3
  },
  ```
- New top-level block after `dyno`:
  ```json
  "lift": {
    "hireFeeYen": 5000,
    "purchasePriceYen": 400000,
    "minReputationTier": "local",
    "underCarStepDiscountPoints": 1
  },
  ```
- New top-level block after `repairBandCeilingByTier`:
  ```json
  "repairJobs": {
    "service": { "target": "worn", "toolTier": 1 },
    "rebuild": { "target": "fine", "toolTier": 2 },
    "restore": { "target": "mint", "toolTier": 3 }
  },
  ```

In `packages/content/src/economy.ts` add the matching schema sections (`.strict()`
objects; `feeYenByGroup` keyed over all six `ComponentId`s int positive; `amortisationDays`
/ `maxHiredLinesPerDay` / `slogMultiplier` int positive; lift fields int positive +
`ReputationTierSchema` + `underCarStepDiscountPoints` int nonnegative; `repairJobs` an
object of the three named jobs each `{ target: ConditionBandSchema, toolTier:
ToolLevelSchema }`, refined: targets strictly ascending in band order and toolTiers
strictly ascending). Doc comments describe behaviour, not this sprint.

### 5. `packages/content/data/toolLines.json`: tier 2 prices

Set `upgradePriceYen` on tier 2 (second tier entry) to: engine 600000 (unchanged),
drivetrain 550000, suspension 300000, wheels 250000, body 400000, interior 280000.
No other field changes.

### 6. `packages/content/data/toolShops.json`: prices

Set `upgradePriceYen`: machine-shop 3000000, chassis-shop 2200000, body-and-trim-shop
1500000. No other field changes.

### 7. Probe retarget: `packages/sim/tests/storyMissionProbes.test.ts` amortisation block

The 'machine-shop assist coherence' describe (around line 845) asserts
`machineShopAssist.feeYenByGroup[group] * probeAmortisationOps <= tier2 price`, which the
new drivetrain price breaks (18,000 x 40 > 550,000). Retarget the probe at the NEW block:
for each group, `toolHire.feeYenByGroup[group] * toolHire.amortisationDays <=
TOOL_LINES[group].tiers[1].upgradePriceYen`, and add the derivation assertion
`feeYenByGroup[group] === TOOL_LINES[group].tiers[1].upgradePriceYen /
toolHire.amortisationDays`. Update the comment block to describe the toolHire fee rule
(fee = price / amortisation days; forty hires buy the kit). The old `machineShopAssist`
reads in OTHER probes (`make-it-pull`, "no other authored aftermarket slot") stay
untouched this sprint; they still assert the live sim path.

### 8. Tests

- New `packages/content/tests/workbench.test.ts`: parses under the schema; `benchByGroup`
  covers all six groups; recipes cover EXACTLY the 23 expected part ids (assert the sorted
  key list against a literal: all taxonomy ids minus `clutch`, `brakePadsDiscs`, `tyres`,
  `bodywork`, `paint`); every step's tool resolves on its resolved bench (if implemented
  as a test per task 2); exactly four `requiresMachine` steps and they are
  `exhaust.rebuild[0]`, `chassis.rebuild[1]`, `chassis.restore[0]`, `rims.restore[0]`;
  no step copy contains a U+2014.
- `packages/content/tests/schemas.test.ts`: add the new economy keys to the required-anchor
  list (`toolHire`, `lift`, `repairJobs`, `energy.energyPerStepPoints`); add a value
  assertion mirroring the existing style for `toolHire.feeYenByGroup`.
- `packages/content/tests/spellingGuard.test.ts`: extend `findOffenses()` to sweep every
  recipe step `copy` string and every bench/tool `displayName` in the workbench data
  export (the guard does not sweep new JSON automatically).
- `packages/content/tests/economyApprovalGate.test.ts`: re-pin the hashes for
  `economy.json`, `toolLines.json`, `toolShops.json`; ADD a sixth hash pin for
  `workbench.json` (step counts are economic surface); append a dated ledger paragraph
  naming every lever moved this sprint with its R1 felt-behaviour line (copy the rows
  from `repair-refactor-lever-ledger.md`).
- Taxonomy: extend the existing taxonomy assertions (wherever `machineGate`/`repairable`
  values are asserted, likely `schemas.test.ts`) with the 13-part `underCar` list.

### 9. Checks (run once each, narrowest first)

- `pnpm test packages/content` (whole content project: schemas, workbench, guards, gate).
- `pnpm test packages/sim/tests/storyMissionProbes.test.ts` (the retargeted probe).
- Golden masters: `pnpm test packages/sim/tests/advanceDay.test.ts packages/sim/tests/careerReplay.test.ts`.
  Expected green (no sim behaviour changed). If a hash moved, the ONLY acceptable cause is
  a scripted tool-line/shop purchase at a changed price; verify the cash delta equals the
  price delta exactly, then re-pin with a trace comment. Any other cause: STOP, report,
  do not re-pin.

## Exit

All nine tasks landed. Content and schemas only, exactly as scoped: no sim source file was
touched, and the one sim test file changed is the probe retarget task 7 names. Everything
except the tool and shop prices is additive, so the live sim still reads `machineShopAssist`,
`energyPerBandStepByToolTier` and the free band climb; `toolHire`, `lift`, `repairJobs`,
`energyPerStepPoints` and the whole workbench sit beside them unread until sprint 225 onward.

### Files landed

New:

- `packages/content/data/workbench.json`: three benches with all five zones each, and 23
  part recipe ladders (service/rebuild/restore), verbatim from the task 1 block.
- `packages/content/src/workbench.ts`: `BenchIdSchema`, `BenchZoneSchema`, `BenchToolSchema`,
  `BenchZoneToolsSchema`, `BenchSchema` (refined: all five zones present), `RecipeStepSchema`,
  `PartRecipesSchema`, `WorkbenchContentSchema` (refined: `benchByGroup` covers all six
  groups, bench ids unique, benches are exactly the three enum values), `RepairJobKindSchema`,
  and the inferred types.
- `packages/content/tests/workbench.test.ts`: 7 tests (schema parse; `benchByGroup` covers
  all six `ComponentId`s; recipes cover exactly the 23 bench-repaired ids; every step's tool
  exists on its resolved bench; no `requiresMachine` step names a tier1 tool; exactly four
  `requiresMachine` steps at `chassis.rebuild[1]`, `chassis.restore[0]`, `exhaust.rebuild[0]`,
  `rims.restore[0]`; no step copy carries a U+2014).

Modified:

- `packages/content/data/economy.json`: `energy.energyPerStepPoints` 4; new `toolHire`,
  `lift` and `repairJobs` blocks at the positions task 4 names. No existing key touched.
- `packages/content/data/toolLines.json`: tier 2 `upgradePriceYen` 600,000 / 550,000 /
  300,000 / 250,000 / 400,000 / 280,000 across engine, drivetrain, suspension, wheels, body,
  interior. No other field.
- `packages/content/data/toolShops.json`: `upgradePriceYen` 3,000,000 / 2,200,000 /
  1,500,000. No other field.
- `packages/content/data/parts-taxonomy.json`: `"underCar": true` on exactly the 13 entries
  task 3 lists, and no others.
- `packages/content/src/carPart.ts`: `underCar: z.boolean().default(false)` on
  `CarPartTaxonomyEntryContentSchema`. `machineGate` untouched (it retires in sprint 231).
- `packages/content/src/economy.ts`: `repairJobs` (refined: target band and tool tier both
  strictly ascending), `energy.energyPerStepPoints`, `toolHire` and `lift` schema sections.
- `packages/content/src/data.ts` / `index.ts`: `WORKBENCH` parsed at load and re-exported,
  following the `TOOL_LINES`/`TOOL_SHOPS` pattern.
- `packages/content/tests/schemas.test.ts`: the four new keys added to the required-anchor
  list, a `toolHire` value assertion, `energyPerStepPoints` asserted alongside the existing
  energy knobs, and the 13-part `underCar` list asserted on the taxonomy.
- `packages/content/tests/spellingGuard.test.ts`: `findOffenses()` now sweeps every recipe
  step `copy` and every bench and tool `displayName`.
- `packages/content/tests/economyApprovalGate.test.ts`: three hashes re-pinned, a sixth pin
  added for `workbench.json`, ledger paragraph appended (quoted below).
- `packages/sim/tests/storyMissionProbes.test.ts`: the Sprint 85 amortisation probe retargeted
  at `toolHire`, now also asserting the derivation
  `fee === TOOL_LINES[group].tiers[1].upgradePriceYen / amortisationDays`.

### Gate re-pin

Four hashes, each `sha256(JSON.stringify(import))`, computed the way the test computes them:

| File | Hash |
| --- | --- |
| `economy.json` | `84de5a0884ee4523613b714b6075ad48a8e897b9854ffd709c0aef04d1a85a5f` |
| `toolLines.json` | `154114c1b57a1a2dca505119dfea249b236fab5daefaa9f160f155befd24dba2` |
| `toolShops.json` | `614b847052a6c9c136ef3988505c5ce0c5519a3fa07dbd96f237355a7e2de4e4` |
| `workbench.json` (new pin) | `a96b72c33da9dfe6c108f21a8e7c3465f67dce1ab8f4e810979c02724f4027cd` |

`partPricing.json` and `damagePatterns.json` are untouched and their pins hold; the mission
payout and budget cap pin is unchanged. The gate now runs 7 tests (six hashes plus the payout
table).

The ledger paragraph appended to that file's header, verbatim:

```text
Re-pinned 2026-08-20 for sprint224.md (the repair refactor arc's content foundations),
under the behaviour-first governance amendment: the arc's design of record
(docs/design/systems/repair-refactor-spec.md) is the maintainer approval for the SHAPE of
the tool ladder, the day hire, the lift and the three-job repair model, and every value
below is Claude's own choice, stated here by felt behaviour and recorded lever by lever in
docs/sprints/repair-refactor-lever-ledger.md (R1), validated by playtest rather than
pre-ratified. `economy.json`, `toolLines.json` and `toolShops.json` all move;
`workbench.json` joins this gate.

`toolLines.json` tier 2 `upgradePriceYen`, all six lines. engine 600,000 (unchanged): the
engine line stays the flagship purchase, a serious commitment around the `local` milestone.
drivetrain 900,000 -> 550,000: no longer priced above the engine line, so a gearbox bench is
a mid-game step rather than an end-game one. suspension 250,000 -> 300,000: the rung now
buys real Rebuild capability (floor press, rebuild tooling), not just a better ceiling.
wheels 150,000 -> 250,000: the rim straightener ram is a genuine earner, priced like one.
body 280,000 -> 400,000: the rung now carries the MIG and the parts-repair Rebuild kit, not
just the panel pipeline. interior 350,000 -> 280,000: the cheapest line, the natural first
buy for a flip-polish player.

`toolShops.json` `upgradePriceYen`, all three shops. machine-shop 3,500,000 -> 3,000,000:
still the largest single purchase in the game, but no longer past the point of aspiration at
`known`. chassis-shop 2,500,000 -> 2,200,000: the middle of the three, a committed chassis
specialist's move. body-and-trim-shop 600,000 -> 1,500,000: the room now grants Restore
across two groups on top of the paint pipeline's top end, and 600,000 undersold that badly.

**The two body figures SUPERSEDE the sprint222.md task A re-pin above** (body tier 2 700,000
-> 280,000, `body-and-trim-shop` 1,500,000 -> 600,000): those values are left in place as
the historical record of what shipped then. What moved is scope, not judgement. Sprint 222
priced both rungs as the panel-and-paint pipeline alone; under this arc the same two rungs
also carry parts repair for the body and interior groups, so each is re-priced for what it
now unlocks. The tier 2 rung is still well below its pre-222 700,000.

`economy.toolHire` (NEW block, additive: `machineShopAssist` is untouched this sprint and
still drives the live hire path). `feeYenByGroup` engine 15,000, drivetrain 13,750,
suspension 7,500, wheels 6,250, body 10,000, interior 7,000, with `amortisationDays` 40.
Derived, not chosen: each fee is exactly its own group's tier 2 `upgradePriceYen` divided by
`amortisationDays`, so forty hire days buy the kit outright and no fee can drift away from
the rung it stands in for. The felt behaviour is that hiring stays the sane default until
the work is weekly: an engine-out day is a real spend, the wheels ram earns its fee on one
straightened rim, and a body hire covering MIG work on a customer car still quotes
profitably. The Sprint 85 hire-coherence probe now asserts that division itself rather than
only the amortisation bound it used to check.

`economy.toolHire.maxHiredLinesPerDay` 1 (NEW). Felt behaviour: a hire day is a planned day
around one bench, not a shopping spree.

`economy.toolHire.slogMultiplier` 3 (NEW; the same value `machineShopAssist.
machinelessLaborMultiplier` carries today, which retires with its block). Felt behaviour:
slogging a step without the rig triples it, so it stays possible, visibly painful, and never
the plan.

`economy.energy.energyPerStepPoints` 4 (NEW, one lever standing in for the per-tier
`energyPerBandStepByToolTier` table once the sim moves onto it). Felt behaviour: a two-step
Service is most of one labour slot (8 points of 10), and a Rebuild with a removal and a
refit around it is a solid morning's work. One lever to tune, not three.

`economy.lift` (NEW block). `hireFeeYen` 5,000: a lift day is cheap enough to book for any
under-car job worth doing. `purchasePriceYen` 400,000: an early-mid garage fixture, the
first "the garage is becoming real" equipment buy after a tool line. `minReputationTier`
`local`: it arrives with the first tool-line rung of standing. `underCarStepDiscountPoints`
1: every under-car step and every remove or refit action is one point lighter (floor 1), so
owning the lift is felt every day and never decisive on any single job.

`economy.repairJobs` (NEW block, structural rather than a number): `service` targets `worn`
at tool tier 1, `rebuild` targets `fine` at tier 2, `restore` targets `mint` at tier 3.
Three named jobs in place of a free climb up the bands. Mint work moves behind shop
ownership, where tier 2 reaches it today; the felt behaviour is that a mint part is the mark
of a garage with a room for it, while mint stays reachable for anyone who buys a mint part.

`workbench.json` is PINNED FOR THE FIRST TIME here. It is not a price sheet, but its recipe
step counts are economic surface: a step costs `energyPerStepPoints` of the day and names
the tool rung the job needs, so adding or removing one re-prices that job in both labour and
tool ownership as surely as moving a fee would. Pinning it keeps a step count from drifting
silently the way eleven `partPricing.json` levers once did.

Nothing else moves. `partPricing.json` and `damagePatterns.json` are untouched, so their
hashes hold, and no mission payout or budget cap moves: the live hire path still reads
`machineShopAssist`, whose fees are unchanged, and no mission probe reads a tool-line or
shop price into its build cost.
```

### Evidence

Each command run once, narrowest first.

- `pnpm test --project content`: 32 files, 649 tests, all passing. Covers the schemas, the
  new workbench tests, both guards and the re-pinned gate.
- `pnpm test packages/sim/tests/storyMissionProbes.test.ts`: 1 file, 19 tests, all passing.
  The retargeted amortisation probe holds with the derivation assertion: every fee is exactly
  its tier 2 price over 40 (600,000/40 = 15,000; 550,000/40 = 13,750; 300,000/40 = 7,500;
  250,000/40 = 6,250; 400,000/40 = 10,000; 280,000/40 = 7,000).
- `pnpm test packages/sim/tests/advanceDay.test.ts packages/sim/tests/careerReplay.test.ts`:
  2 files, 23 tests, all passing. Both golden masters are GREEN and no hash was re-pinned,
  which is the expected result. The 30-day scripted career's only tool spending is
  `hireForDay`'s two `resolveHireMachineLine` calls (body on day 1, suspension on day 3),
  which read `machineShopAssist.feeYenByGroup`, untouched this sprint; it buys no tool line
  and no shop (`toolShopsOwned` starts and stays empty). `careerReplay.test.ts` touches no
  hire or tool purchase at all.

The pre-push hook is the full gate (directive 20) and was not pre-empted. `pnpm typecheck`
was not run by this closing task: the directive 20 carve-out covers retiring, renaming or
reshaping a schema field or exported symbol, and this sprint only ADDS keys and exports,
nothing retired or reshaped.

### Deviations from the doc, with reasons

1. Task 2 specifies `recipes: z.record(CarPartIdSchema, PartRecipesSchema)`; it landed as
   `z.partialRecord(...)`, because only 23 of the 28 `CarPartId`s carry a recipe and a full
   `z.record` would type the missing five as present. Same partial shape `carInstance.ts` and
   `gameState.ts` already use for other CarPartId-keyed maps that do not cover every part.
   The exact key set is asserted literally in `workbench.test.ts` instead.
2. Task 2's third refine (every step's tool exists on its resolved bench) and the
   `requiresMachine` tier check both live in `workbench.test.ts` rather than in the schema,
   taking the option task 2 offers by name: resolving a step's bench needs the taxonomy's
   `group` field, so a refine would either cycle against `data.ts` or parse the taxonomy a
   second time. `WorkbenchContentSchema`'s doc comment records where the two checks went.
3. Task 2 names the job-kind type `JobKind3`; it landed as `RepairJobKind`, the `z.infer` of
   `RepairJobKindSchema`, matching the file's own naming for every other exported type.
4. Task 9 says `pnpm test packages/content`; it was run as `pnpm test --project content`, the
   project selector CLAUDE.md's command list uses. Same 32 files.

Nothing is left open.

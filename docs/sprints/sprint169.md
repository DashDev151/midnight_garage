# Sprint 169: the colour palette

**Design of record:** `docs/design/systems/paint-system-design.md`.
**Research of record:** `docs/design/reference/colour-palette-consolidated.md` and the four
`factory-colours-*.md` files behind it.

**Scope amendment, maintainer-approved 2026-08-03.** This sprint opened as "content and research
only, no code, no schema". It now runs through to **the palette existing in the game and being
reviewable on a dev screen**, because the alternative was a third hand-copied dataset: the 34
colours currently sit in a dev-only TS module and the 94 pools in a markdown table, and wiring a
review screen to those would copy 94 rows into a third place before either was canonical.

The **paint system itself is Sprint 170** and nothing in it moves here: no generation change, no
`stocknessOf` change, no SKUs, no paint stage change, no HSB picker.

## Goal

**A colour pool per car, canonical in the CSV, live in content, and reviewable by eye.** Without it
a Honda Beat generates in Bayside Blue and the game calls that factory.

## Reuse analysis (directive 16)

### Genuinely new

| new | why nothing covers it |
| --- | --- |
| `paintAliases.json` | a name bound to a colour AND to a set of cars. No existing content maps one vocabulary entry to a car list |
| `spec.factoryColours` | the first per-car field whose value is a LIST rather than a scalar |
| Two CSV columns whose cell is a delimited list | every existing column holds one value |

### Existing mechanisms reused, not rebuilt

| concern | what already does it |
| --- | --- |
| Real name vs parody name, one flag | `naming.ts`: `NAMING_MODE`, `resolveCarDisplayName`. Aliases get `resolvePaintColourName` on the same constant, and their real names join `REAL_MODEL_TOKENS` in the same leak test |
| Value vs provenance on one field | `priceYen` + `priceStatus`. `factoryColours` + `factoryColoursBasis` is that pattern, second use |
| CSV is canonical, `cars.json` is a copy | `rosterCsvGuard.test.ts`, built to "grow teeth as each field lands". Both new columns get teeth, no rewrite |
| The four-tone ramp | `paintRamp.ts` `rampFor` already derives shade and highlight per finish. It moves out of `screens/dev/` so the game can use it; the maths does not change |
| The car sprite | `buildMasterCar` and the 96x48 master. The review screen renders pools through the sprite that already exists |
| Colour vocabulary in the UI | `CarDetailScreen.vue` already reads `PAINT_COLOURS` for its per-zone picker. It keeps reading it; the list underneath changes |

**Not stood up in parallel:** no second colour list, no second name-flip mechanism, no second
ramp function, no second car sprite.

## The data model: two tables, not one

The research separates cleanly and the content must too.

**1. The palette, 34 colours.** `id`, `name`, `shade` (the art brief), `hex` (the base tone the ramp
is derived from). The names are generic by construction: "Deep Blue", "Bright Silver", "Sand Beige".
**None of them is anybody's trademark**, so the naming layer does not touch this table.

**2. The iconic aliases, 37 entries.** `id`, `realName`, `parodyName`, `colourId`, `cars`. These are
manufacturers' names for manufacturers' colours and they flip through `NAMING_MODE` exactly as
brands do.

**Why the alias binding is per car and not per colour.** `blue-deep` on an R34 is Bayside Blue; on
an FD3S the same ramp is Montego Blue. One colour, two names, decided by which car is wearing it.
The alias table already carries its car list in the research, so it owns the binding and the pool
cell stays a plain list of colour ids.

### The CSV cell format

Pipe-separated colour ids, `+` joining the two halves of a factory two-tone. No commas, so the
existing quoted-CSV parser needs no change and no cell needs quoting.

```text
white|silver|red-deep|blue-navy
blue-rally+grey-mid|red+grey-mid
```

Both columns append at the end of the header (59 and 60), so no existing column index shifts.

## Tasks

**A. The palette into content.** `paintColours.json` becomes the 34, carrying `shade` alongside
`id`/`name`/`hex`. Schema and `paintColour.test.ts` updated (its `length` assertion is a stale
assertion under directive 17 case (a), not a regression). The 12 are retired and their three
consumption points corrected: `CarDetailScreen.vue`'s picker (reads the list, no id hardcoded),
its test, and `zoneSeverity.test.ts`'s hardcoded `pearl-white`.

**B. The alias table.** `paintAliases.json` with its Zod schema, `resolvePaintColourName` in
`naming.ts`, and the real names added to the leak guard so parody mode cannot leak "Bayside Blue".

**C. The CSV.** `factoryColours` and `factoryColoursBasis` appended, all 94 rows, transcribed from
the research's per-car table. The research doc drops to provenance, the same status
`reference/period-scans/roster-price-list-v2.md` holds for price.

**D. The model.** `spec.factoryColours` on `CarModel` with its Zod array, the 26 shipped rows of
`cars.json` filled, and teeth in `rosterCsvGuard.test.ts` for both new columns. Runs `pnpm
typecheck` before reporting (directive 20 carve-out: this reshapes a schema field).

**E. The review screen.** `PaintPaletteScreen.vue` gains a car selector. Selecting a car renders its
pool: the car sprite in each colour, the palette name, the alias name where the car has one, the
basis, and the per-car note. The dropdown covers all 94 by raw-importing the roster CSV inside the
existing `import.meta.env.DEV` block, so the 68 cars not yet in `cars.json` can still be reviewed
and nothing extra ships.

**F. Maintainer sweep of the 37 parody names**, against screen E rather than against a list.

## Levers (directive 22)

**None.** No economy value, no price, no payout, no sim formula and no pricing constant is touched.
A colour carries no cost: the paint stage's price lives with its material SKU and that SKU is not
edited here.

## Definition of done

1. `paintColours.json` holds the 34, schema-valid, with the shade brief on each.
2. `paintAliases.json` holds the 37, flipping through `NAMING_MODE`, leak-guarded.
3. All 94 roster rows carry a pool and a basis; the guard reads both.
4. `spec.factoryColours` on the model and on the 26 shipped cars, agreeing with the CSV.
5. The dev screen selects any of the 94 and renders its pool.
6. `pnpm typecheck` clean; the narrowest relevant tests run once.

## Deliberately deferred

- **The three cars that cannot be honestly authored** (54 Altezza RS200, 56 Chaser JZX100,
  85 Cosmo Sport 110S). They ship the construction with `factoryColoursBasis` reading `provisional`
  or `thin`, which is exactly what that column exists to say. No invention is laundered as research.
- **Factory two-tone vs bad respray.** The zone-mismatch rule treats colour disagreement as a
  defect. Seven cars need it taught otherwise. Sprint 170, and until then every two-tone has its
  single-colour fallback named in the research.
- **Ramps beyond the base hex.** `rampFor` derives shade and highlight per finish from the base, and
  the five closest pairs in the palette are the art brief for checking that holds. Hand-cut ramps
  per colour are art work, not content work.
- **Buyer colour preference.** Its own thing, later.

## Exit

**Tasks A to E are done. Task F, the parody-name sweep, is the maintainer's and is open.**

- [x] **A.** `paintColours.json` holds the 34, each with `id`, `name`, `shade` and `hex`. Hexes are
      the approved values, transcribed unchanged. `paintColour.ts` gained `shade`; its test's
      `length` assertion went 12 to 34 (directive 17 case (a)). The twelve retired ids were swept
      across `packages/`: the only live reference was one hardcoded `pearl-white` in
      `zoneSeverity.test.ts`, because `CarDetailScreen.vue` reads the list rather than any id.
- [x] **B.** `paintAliases.json` holds the 37, each binding a real name, a parody name, a colour and
      the cars that carried it. `resolvePaintColourName` sits on the existing `NAMING_MODE`, and
      `REAL_COLOUR_NAMES` joins the leak guard. Four names are deliberately outside that guard
      (Vintage Red, Alpine White, Brilliant Blue, Strong Blue): each pairs an everyday word with an
      ordinary colour word in plain-English order, which is the same trap the existing `STI`
      exclusion documents. The guard is scoped to resolved alias names only, so ordinary copy
      mentioning a grand prix cannot false-fail.
- [x] **C.** All 94 roster rows carry `factoryColours` and `factoryColoursBasis` (columns 59 and 60).
      Verified independently of the transcription: 94 rows, every row at the header's cell count,
      every id one of the 34, all 34 used by at least one car, pools running 1 to 13 entries.
      The research doc's own summary table was miscounted and is corrected against the CSV, which is
      now where those counts are canonical: catalogue 29, list 25, typical 20, partial 17,
      provisional 2, thin 1.
- [x] **D.** `spec.factoryColours` is on `CarModel`, required on the same footing as
      `reliabilityBase`, and on all 26 shipped cars in the order the CSV authored. The roster guard
      compares both columns and fails on content or order. A cross-validation test resolves every id
      of every shipped car, two-tone halves included, against `PAINT_COLOURS`. Eight files that
      hand-build a `CarModel` needed the field; no shared model fixture existed to fix once, and two
      of the eight are not tests (`lapModel.ts`'s synthetic chassis and the sandbox car generator).
- [x] **E.** The dev screen selects any of the 94 and renders its pool: the car in each colour, the
      parody name headlined with the real name beneath it, the basis with its legend, and a marker
      for the 26 that ship. All 94 come from a `?raw` import of the roster CSV inside the existing
      `import.meta.env.DEV` block; the production build confirms the whole route is tree-shaken out.
      `factoryPalette.ts` is deleted (its data is content now) and `paintRamp.ts` moved from
      `screens/dev/` to `pixi/`, so no dev-only copy of either the palette or the ramp rule remains.
- [ ] **F.** The 37 parody names, swept against screen E.

### Two data faults the screen work surfaced, both fixed

**Midnight Purple named four cars and only two carry it.** The iconic table listed "78, and 36, 48,
58 where the window allows", and the per-car research had already resolved that phrase: the 180SX's
window is unresolved and the S14's grade catalogue does not carry LP2, so neither is in its pool.
The pool is the side that decides. The alias now names 78 and 58.

**The panda scheme was labelling plain white cars.** An AE86 was sold both in plain white and in the
white-over-black two-tone, and matching an alias on the first half of a pool entry put High-Tech
Two-Tone's name on both. `colourId` now takes the same form a pool entry takes (a palette id, or two
joined by `+`) and the match is on the whole entry.

**A guard now pins the class of fault rather than the two instances**: no iconic name may bind to a
car whose authored pool lacks that colour. It reads the CSV and the alias table, which is exactly
the pair that disagreed.

### Checks

`pnpm typecheck` clean across content, sim and game (directive 20 carve-out: this reshapes a schema
field). `pnpm test --project content` 597 passed across 28 files; `--project sim` 2182 passed across
84; the moved and new dev-screen tests 14 passed across 3. The pre-push hook remains the full gate.

### Not verified

**Nobody has seen the screen render.** Neither I nor the agent that built it can view images. Layout,
spacing, and whether a 13-colour pool renders acceptably as fourteen small canvases at once are
unchecked, and the ramps have never been judged by eye at all. That is what task F is for, and it is
the reason the screen exists.

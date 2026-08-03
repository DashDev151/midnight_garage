# Colour palette: consolidated

**Status: PROPOSAL, unsigned.** Nothing here is authored into content. It is the consolidation stage
of `docs/sprints/sprint169.md`, and it takes as input the four research files:

| file | cars |
| --- | ---: |
| `factory-colours-research.md` | 22, plus the method |
| `factory-colours-deep-jdm.md` | 13 |
| `factory-colours-deep-classics.md` | 14 |
| `factory-colours-shallow.md` | 45 |

Design of record for what it feeds: `docs/design/systems/paint-system-design.md`.

## The merge criterion

The game renders car bodies as an **indexed four-tone ramp with runtime palette swapping**
(`art-direction.md`). So the test applied throughout is one question:

> **Could two period colours be told apart on a four-tone pixel sprite?**

If not, they are one colour. Roughly 480 researched colour names come out the other side as **34
palette colours**.

Five rules, each learned in the research and each recorded there:

1. **Merge on shade, never on name.** Code 576 is Super Bright Yellow in Japan and Solar Yellow in
   the United States. One colour, two names.
2. **Never map a name to a code across models.** Dark Green Mica is 6M1 on a 1995 MR2 and 6Q7 on a
   1999 Altezza. The model and the year are the key.
3. **Drop what was never actually built.** See "What was dropped" below.
4. **Merge ruthlessly, but keep the range.** Five near-identical light blues are one colour; a car
   with four options must not end up with four greys.
5. **Iconic colours survive consolidation whatever the merging says.** They are the reason the
   feature exists.

**The test that outranks every source: would somebody who knows these cars look at this merge and say
yes, obviously?** If not, the merge is wrong however the metadata reads.

### Colour-family headings are a tiebreaker on nuance, never a reclassification

The Japanese catalogues file each colour under a family heading, and the research treated those
headings as strong shade evidence. They are useful for **nuance within the obvious family**: two
blues to merge and a heading telling you one leans turquoise while the other is a true navy is a real
distinction and it sharpens the merge.

**They are not good enough to override what a colour plainly is.** Where a heading fights the plain
reading of the colour, the plain reading wins and the heading is noise. A colour is what it plainly
is: Athlete Silver is a silver, Diamond Grey Metallic is a grey, Montego Blue Mica is a blue.

Headings set aside on that basis, with the placement actually used:

| colour | heading | placed in | why |
| --- | --- | --- | --- |
| Athlete Silver (KV2) | PURPLE | `silver` | it is a silver, and anyone who knows an R34 would spot it in the purple bucket instantly |
| Diamond Grey Metallic (38E) | GOLD | `grey-mid` | it is a grey |
| Montego Blue Mica | GREEN | `blue-deep` | it is a blue, with turquoise in it |
| Mist Grey Metallic (DL2) | GREEN | `grey-mid` | it is a grey |
| Nurburgring Blue Metallic | CYAN | `blue-rally` | it is a blue; nothing beyond the heading says how light |
| Meteor Blue Metallic | CYAN | `blue-rally` | as above |
| Royal Navy Blue Pearl | TEAL | `blue-navy` | it is a navy |
| New Imola Orange Pearl | YELLOW | `orange` | it is an orange |
| Cranberry Red | MAROON | `maroon` | heading and plain reading agree; kept for that reason, not for the heading |

Headings **used**, because they refine within the obvious family and the colour's own name already
points the same way: Greenish Blue (FN2) leaning teal, Greyish Green Mica Metallic being a muted
green rather than a green, Bluish Grey Argentum being a cool grey, Dark Greyish Olive being an olive.

## Two decisions that shape everything below

### 1. Colour and finish are separate axes

A palette entry is a **shade**: a hue, a lightness and a cast. **Finish is carried per pool entry,
not per palette entry**, because the same shade shipped as a solid on one car and a mica on another.
Super Red (solid) and Super Clear Red (pearl metallic) are one colour in two finishes, not two
colours.

This falls out of the paint design's own ladder, where street / sport / race is solid / metallic /
pearl on **any** colour. It also lets the palette express a real research finding: the JZZ30 Soarer
2.5 GT-T was **never sold in a solid white**, only ever a pearl. That is `white (pearl)` in its pool
and `white (solid)` absent, which is exactly true.

Consequence for the palette: no `black-solid` plus `black-pearl` pair, no `white-solid` plus
`white-pearl` pair. One `black`, one `white`. The finish modulates the ramp's spread and highlight;
the palette entry supplies the ramp.

### 2. An iconic colour is a name on a ramp, not always a ramp of its own

Rosso Corsa, Milano Red, Tornado Red, Passion Red and New Formula Red are all a bright saturated
solid red. On four tones they are the same ramp. Splitting them would be splitting on name, which
rule 1 forbids.

So an iconic colour is **a named alias bound to a palette colour and to specific cars**, exactly as
the naming layer already binds `parodyName` to a car's real `displayName`. One ramp, many names: a
Ferrari shows the Rosso Corsa alias, a Mk2 Golf shows the Tornado Red alias, a Corolla in the same
red just shows "Bright Red".

**Where an iconic colour's shade is genuinely singular, it gets its own palette entry and the entry
exists because of it.** That is the case for Midnight Purple (three entries), Blauschwarz, Gun Grey,
Grand Prix Maroon and Titanium Grey. Rule 5 licenses this, and it is
the only place iconicity is allowed to beat merging.

## What a colour still needs, and does not have here

**The ramps are not authored in this document.** Sprint 169's definition of done item 5 ("every
colour carrying what a four-tone sprite ramp needs, not one hex") is **outstanding**. Deriving four
tones per colour is art-direction work against the art bible, and inventing hex values from
sentence-long shade descriptions would be the same failure as inventing a shade to merge on. The
shade column below is the brief for that job.

The existing twelve in `packages/content/data/paintColours.json` are retired by this proposal.

---

## The palette

34 colours. `finishes` lists the factory finishes actually attested across the merged set; it is not
a constraint on what a respray can be.

| id | name | shade | finishes seen | merged from |
| --- | --- | --- | --- | --- |
| `white` | Plain White | flat bright white, no cast | solid, pearl, 3-stage pearl, mica | Super White II / III (040), White (041), Crystal White (326), Pure White, Feather White, Scotia White, White Solid, Chaste White, Grand Prix White (908), Bianco Avus, Bianco, Bianco Polo Park, Bianco Perlato, Pegasus White, Kilimanjaro White, Sophia White (W09), Alpine White II (218), Alpine White, Diamond White, Alaskan White, Polar White, Frost White, Clear White, Crete White, Greek White, Whitest White (079), Swan White, Sunny/Vivio/Copen/kei "White"; pearls: Pearl White 3P (WK0), White Pearl 3P (QX1), White Pearl (QN0), Crystal White Pearl Mica (34K), Platinum White Pearl, Premium White Pearl, Galaxy White (W75), Pearl White (077), Neutron White Pearl |
| `white-ivory` | Ivory White | off-white with a warm ivory or cream cast; still reads white, never beige | solid, pearl | **Championship White (NH-0)**, Old English White, Ivory, Almond Cream, Warm White (S13), Silky Snow Pearl, Ivory Pearl (R35) |
| `silver` | Bright Silver | bright clean light metallic, neutral to faintly cool | metallic, mica | **Athlete Silver (KV2)**, Silver Metallic (199, 148, 531), Spark Silver (KL0), Sonic Silver (KR4), Sparkling Silver (WV2), Clear Silver, Jet Silver (KG1), Sebring Silver, Vogue Silver (NH-583M), Satin Silver, Alabaster Silver, Satellite Silver, Hamilton Silver (A71), Grace Silver (H84), Silent Silver, Blade Silver, Quartz Silver, Sunlight Silver (22V), Aluminium Metallic (38P), Super Silver, Premium Liquid Silver, Metallic Silver (1F2), Sterling Silver (244), Nogaro Silver (243), Arctic Silver, Cool Silver, Light Silver, Bright Silver, Stream Silver, Shadow Silver Mica (3G), Silver Stone Metallic, Silverstone Metallic (Mazda), Thunder Silver, Argento Nurburgring, Argento Luna, Silver Metallic (980), Premium Silver, Silver Mist, Greenish Silver, Bluish Silver, plain "Silver" throughout the shallow pass |
| `silver-warm` | Champagne Silver | light metallic with a warm champagne or pinkish cast; the name of every member says so | metallic | Yellowish Silver (M), Yellowish Silver Two-Tone, Salmon Silver Metallic (203), light gold metallic (Carina) |
| `silver-violet` | Violet Silver | light-to-mid metallic with a clear violet cast. **The entry rests on the colours' own names, not on a heading**: every member is called purplish something | metallic, mica | Purplish Grey (LN1), Purplish Silver Two-Tone, Purplish Silver Metallic, Medium Purplish Grey Mica |
| `grey-mid` | Ash Grey | pale-to-mid grey, flatter and less lustrous than a silver; neutral to faintly warm | metallic, pearl, mica, solid | Grey Metallic, Grey (KJ7), **Diamond Grey Metallic (38E)**, **Mist Grey Metallic (DL2)**, Warm Grey Pearl Mica (046), Silver Grey, Covert Grey, Palermo Grey (L83), Moonrock Metallic, Silverstone Metallic (Honda), Grigio Ingrid, Crystal Grey, Cool Grey, Polaris Grey, Pearl Grey (1G0), Steel Grey, Galaxy Grey Mica (32S), Metropolitan Grey Mica, Diamond Silver Metallic, Silver Metallic Graphite, Bluish Grey Argentum Mica (187), Bluish Gray Metallic, Grayish Blue Metallic, light grey metallic (Mira), Venetian Grey, S-Cargo grey |
| `grey-titanium` | Bronze Grey | mid grey metallic with a faint warm bronze cast, deliberately un-flashy | metallic | **Titanium Grey Metallic**, Titanium (R35), Grigio Titanio |
| `gunmetal` | Gunmetal | dark charcoal metallic with a cool blue cast; near-black in shade, clearly blue-grey in sun | metallic, pearl, mica | **Gun Grey Metallic (KH2)**, Gun Metallic (R35), Canna di Fucile Metallizzato, Grigio Canna di Fucile, Dark Bluish Grey Metallic (183), Dark Grey Metallic, Dark Grey (M), Dark Grey Pearl, Dark Grey, Charcoal Pearl Metallic, Gothic Gray Metallic, Ash Black, Dark Bluish Grey Metallic (Aristo) |
| `black` | Black | plain black, from flat solid to a fine pearl or metallic flake | solid, pearl, metallic, mica | Super Black (KH3), Black (202, 700, 212), Black II (668), Berlina Black, Brilliant Black (PZ), Nero Tenebre, Nero, Serbia Black (X15), Granada Black, Midnight Black, Obsidian Black, Brilliant Black (Mazda); pearls and flakes: Black Pearl Metallic (732), Black Pearl (GV1), Starlight Black Pearl, Granada Black Pearl, Obsidian Black Pearl, Sparkling Black Mica (35N), Black Mica, Diamond Black Metallic (181), Cosmos Black Metallic, Nero Daytona, Pure Black Metallic, Pyrenees Black (X08), Black Metallic (Starlet) |
| `black-blue` | Blue Black | near-black with a deep blue cast; reads black in shade, blue-black in sun | metallic, pearl | **Blauschwarz Metallic (199)**, Nighthawk Black Pearl (B-92P), Dark Bluish Black Pearl |
| `beige` | Sand Beige | pale-to-mid warm sand; reads beige, never white | solid, metallic, pearl | Caramel Beige (499), Light Beige Metallic, Beige Pearl, cream beige (S-Cargo), beige and light beige across the kei and 4x4 cars |
| `brown` | Warm Brown | warm brown, from a soft creamy mid brown to a near-black bronze-brown | solid, metallic, pearl | **Skyline Brown**, Safari Brown, Nougat Brown Metallic (40B), Espresso Brown Metallic (40D), Pearl Brown (4V2), Brownstone, the Delica's brown lower body |
| `gold-ochre` | Ochre Gold | warm ochre-gold metallic, tan-leaning rather than a bright modern gold | metallic | **Safari Gold**, Oro Sahara Metallizzato, Crystal Gold (9H7) |
| `red` | Bright Red | bright saturated red, from neutral to slightly orange-leaning | solid, pearl metallic | Super Red / II / IV (3E5, 3L2), Red (AJ4, 3E6, 3P0), **Milano Red (R-81)**, **New Formula Red**, **Rosso Corsa (300/322)**, **Rosso Alfa (555)**, **Guards Red (027)**, **Tornado Red (LY3D)**, **Passion Red (solid)**, **Grand Prix Red**, Rosso Siviglia, Rosso Monza, Classic Red, Blaze Red (SQ, 1989 mix), Active Red (AR2), Red Solid, Bright Red, Brilliant Red (308), Radiant Red, Solar Red, Monte Carlo Red, Spanish Red, Festival Red, Vivien Red, Splendor Red, Shining Red, Cinnabar Red (138), Mexican Red, Solid Red, Super Clear Red (PM) and II, Kutani Red (R25/R71), plain "Red" throughout the shallow pass |
| `red-deep` | Deep Red | deep rich red, darker and more restrained than a fire-engine red; still unmistakably red | solid, mica, pearl | **Vintage Red**, **Velocity Red Mica (27A)**, Misano Red (236), Carmine Red (80F), Blaze Red (SQ, 1990 mix), Red Pearl (AH3), Red Mica (3N1), Monza Red Pearl, Cardinal Red Metallic, Burning Red, Pearl Red (3S4), dark red (Safari) |
| `maroon` | Maroon | deep dark red-brown, close to burgundy, near-black in shade | solid, mica, pearl, metallic | **Grand Prix Maroon**, Wine Red, Bordeaux Mica, Bordeaux Red Pearl, Crimson Mica, Red Mica (SVX), Dark Red Pearl, Cranberry Red, Rosso Barchetta, Rosso Rubino (324), Cassis Red Metallic (80D), wine red (Sera). Rose Red is separate, see `rose-dusk` |
| `rose-dusk` | Dusk Rose | muted dusky rose; a pink-brown or pink-red with the saturation taken out | metallic, mica | Dark Rose Metallic, Passion Rose Mica, Rose Red, Byzanz Metallic |
| `orange` | Vivid Orange | vivid saturated orange, from yellow-leaning to true orange | solid, pearl metallic | **New Sight Orange**, **New Imola Orange Pearl**, Sunset Orange, Orange (9K5) |
| `yellow` | Vivid Yellow | vivid saturated yellow, no softening | solid, mica, pearl | **Super Bright Yellow / Solar Yellow (576)**, **Lightning Yellow (EV1)**, **Sunlight Yellow (Y-56)**, **Competition Yellow Mica**, **Giallo Modena (4305)**, **Carnival Yellow**, Giallo Fly, Bellatrix Yellow, Sunburst Yellow, Barbados Yellow, Houston Yellow, Summer Yellow (10W), Gialla Ginestra, Jaune Yellow, New Indy Yellow Pearl, plain "Yellow" on the kei cars |
| `yellow-soft` | Soft Yellow | warm yellow with the edge off it: creamy, golden or pearl-deep rather than acid | solid, mica, pearl | **Cashmere Yellow**, Sunshine Yellow, Mellow Yellow Mica, Pearl Yellow (5B0) |
| `lime` | Lime | yellow-leaning green, from an acid lime to a pale mint | solid, metallic | **Lime Green Two-Tone**, **Lime Green Metallic**, Lime Green (9J6), Neo Green, Mint Green (9K1), Fresh Green (9J7), greenish yellow (Sera), light green (City E) |
| `green` | Grass Green | mid true green, neither dark nor muted | solid, mica, pearl | Samba Green, Samba Green Pearl, Neat Green Mica, Green Pearl (S14, Z32), Capri Green, green (Acty, Cappuccino) |
| `green-sage` | Sage Green | muted olive or grey-green; the green cast is clear but the colour is not | metallic, mica, solid | Greyish Green Mica Metallic, Greyish Green Metallic, Dark Greyish Olive Metallic, Kasumi Green, Granite Green Metallic (699), Yellowish Green Pearl, jungle green (Jimny), pastel sage (S-Cargo) |
| `green-dark` | Dark Green | very dark green, near-black in low light | mica, metallic, pearl, solid | Dark Green (DH0), Dark Green Mica (6M1, 6Q7), Dark Green M.I.O., Dark Green Metallic, Dark Green (S13), Racing Green, Atlantis Green, Boston Green Metallic, Mallard Green, Verde Mugello, Verde Scuro, Timber Green (G13), Sherwood Green Pearl, Evergrade Green Metallic, Dark Green Mica (Copen), dark green (kei and 4x4 cars), Shade Green (GU, hue not established) |
| `teal` | Deep Teal | deep blue-green: reads neither blue nor green cleanly | pearl, mica, metallic | **Greenish Blue P (FN2)**, Deep Teal Metallic (752), Greyish Turquoise Mica Metallic (753), Dark Turquoise Mica, Twilight Turquoise Metallic, Bluish Green Mica, Lagoon Green Metallic (35Y), Blueish Green Pearl |
| `cyan` | Light Turquoise | light turquoise: a blue-green pale enough to read as neither | metallic, solid | Turquoise (21M), Surf Blue, light turquoise (Sera) |
| `blue-pale` | Pale Blue | pale sky or ice blue, low saturation | solid, metallic, mica | Sky Blue, Sky Blue Metallic, Diamond Blue Metallic (697), Azzurro California (524), Azzurro Hyperion, Azzurro Dino, Light Blue Mica, Miami Blue, light blue across the kei cars |
| `blue-rally` | Mid Blue | bright mid-toned blue, clean and vivid; lighter than a royal blue and nowhere near navy | mica, metallic, pearl | **WR Blue Mica**, **Strong Blue Metallic (8B6)**, Blue Mica Metallic (8L5), Estoril Blue Metallic, Tonic Blue Metallic, Canal Blue, Innocent Blue Mica, Mariner Blue, Bay Blue, Siberia Blue, Monterey Blue, Pacifica Blue, Medium Blue Mica, Aurora Blue Mica (34J), Stormy Blue, Arctic Blue Pearl, Blu Acapulco, Blu Chiaro, Venetian Blue Metallic (35U), Blu NART, Pearl Blue (8V8), **Nurburgring Blue Metallic**, Meteor Blue Metallic, Blue (TJ1, shade not established) |
| `blue-deep` | Deep Blue | deep saturated blue, rich and lustrous; dark but still plainly blue, not navy | metallic, mica, 3-coat pearl | **Bayside Blue (TV2)**, **Sonic Blue Mica**, **Brilliant Blue TPM (TV3)**, **Royal Blue Mica**, **Montego Blue Mica** (a dark blue with turquoise in it), Grand Blue Mica, Cobalt Blue Pearl, Captiva Blue Pearl, Vivid Blue Pearl, Laguna Blue Mica, Adriatic Blue, Blu Tahiti Metallizzato, Blu Lagos |
| `blue-navy` | Navy | very dark blue, near-black in shade | solid, pearl, mica, metallic | Deep Marine Blue P (BN6), Dark Blue Pearl (TH1), Dark Blue (347), Blu Swaters (516), Blu Scuro, Blu Le Mans, Blu Lancia, Marine Blue Metallic (35V), Brave Blue Mica (5N), Dark Blue Mica, Dark Blue Graphite Pearl, **Royal Navy Blue Pearl**, Superior Blue Metallic, Midnight Blue, dark blue across the shallow pass |
| `blue-violet` | Violet Blue | blue with a clear violet cast; still reads blue | solid, mica, metallic, pearl | **Purplish Blue**, Purplish Blue Mica Metallic, **Macao Blue Metallic (250)**, Slate Blue (9K3) |
| `purple-deep` | Deep Purple | deep purple pearl with pinkish-violet highlights; near-black in low light, unmistakably purple in daylight. **Does not colour-shift** | pearl, metallic | **Midnight Purple P (LP2)**, Techno Violet Metallic, Dark Violet (LC4V), Jewel Violet, Prugna Metallizzato, Black Amethyst (9J0), purple metallic (Mira), purple pearl (EG6) |
| `purple-shift-green` | Shifting Purple | deep rich purple that shifts with viewing angle: green in direct sun, purple through the mid-angles, bronze at the panel edges | multi-layer pearl | **Midnight Purple II (LV4)**. Nothing merges into it |
| `purple-shift-gold` | Shifting Purple, Gold | lighter and bluer than the above, with a fine gold-bronze flake; reads deep violet or blue-purple with gold highlights depending on the light | multi-layer pearl | **Midnight Purple III (LX0)**. Nothing merges into it |

### The closest pairs in the palette

Stated so the art has them in front of it when the ramps are cut, because these are where the merge
criterion is nearest to failing:

- `cyan` and `blue-pale`: both light blues, separated only by the green lean.
- `beige` and `white-ivory`: separated by whether the colour reads as white or as sand. Championship
  White must never read as beige.
- `red-deep` and `maroon`: separated by whether the colour still reads as red.
- `green-sage` and `grey-mid`: separated by the green cast alone.
- `silver-warm`, `silver` and `silver-violet`: three casts on one lightness. The cast has to live in
  the shade tone of the ramp or these collapse.

---

## The iconic colours, with proposed parody names

**The maintainer sweeps these against the copy bar. They are not final.** These are player-facing
names on cars people love, and the bar is "worth reading", not "legally distinct". Every one below is
a proposal; several have obvious alternatives and some are probably wrong in voice.

Mechanically each is an alias: it binds a real name (behind the naming-layer flag) and a parody name
(in front of it) to a palette colour and to the cars that carried it.

| proposed parody name | real name (behind the flag) | palette colour | cars (rosterNo) |
| --- | --- | --- | --- |
| Shoreline Blue | Bayside Blue (TV2) | `blue-deep` | 83 |
| Small Hours Purple | Midnight Purple (LP2) | `purple-deep` | 78, and 36, 48, 58 where the window allows |
| Small Hours Purple II | Midnight Purple II (LV4) | `purple-shift-green` | 83 |
| Small Hours Purple III | Midnight Purple III (LX0) | `purple-shift-gold` | 83 |
| Gunsmoke Grey | Gun Grey Metallic (KH2) | `gunmetal` | 77 |
| Podium White | Championship White (NH-0) | `white-ivory` | 53, 55, 59, 88 |
| Blauschatten Metallic | Blauschwarz Metallic (199) | `black-blue` | 86 |
| Paddock Maroon | Grand Prix Maroon | `maroon` | 70 |
| Paddock White | Grand Prix White (908) | `white` | 70, 76, 82 |
| Paddock Red | Grand Prix Red | `red` | 70 |
| Rosso Gara | Rosso Corsa (300 / 322) | `red` | 90, 91 |
| Giallo Emilia | Giallo Modena (4305) | `yellow` | 90, 91 |
| Gale Red | Tornado Red (LY3D) | `red` | 38 |
| Stage Blue | WR Blue Mica | `blue-rally` | 72 |
| Anniversary Blue | Sonic Blue Mica | `blue-deep` | 81 |
| Lustre Blue | Brilliant Blue TPM (TV3) | `blue-deep` | 62 |
| Stout Blue | Strong Blue Metallic (8B6) | `blue-rally` | 50 |
| Ingot Grey | Titanium Grey Metallic | `grey-titanium` | 79 |
| Reserve Red | Vintage Red | `red-deep` | 52, 79 |
| Estuary Blue | Montego Blue Mica | `blue-deep` | 52 |
| Sentry Red | Guards Red (027) | `red` | 82 |
| Glacier White | Alpine White II (218) | `white` | 64, 68 |
| Slate Blue | Macao Blue Metallic (250) | `blue-violet` | 68 |
| Savannah Gold | Safari Gold | `gold-ochre` | 80 |
| First Light Orange | New Sight Orange | `orange` | 80 |
| Chamois Yellow | Cashmere Yellow | `yellow-soft` | 57 |
| Flash Yellow | Lightning Yellow (EV1) | `yellow` | 58 |
| Beacon Yellow | Super Bright Yellow (576) | `yellow` | 50, 51, 75 |
| Daylight Yellow | Sunlight Yellow (Y-56) | `yellow` | 53, 55 |
| Startline Yellow | Competition Yellow Mica | `yellow` | 52 |
| Verona Red | Milano Red (R-81) | `red` | 20, 21, 29, 55, 59 |
| Grid Red | New Formula Red | `red` | 76 |
| Works Red | Passion Red (solid) | `red` | 60, 65, 67 |
| Fairground Yellow | Carnival Yellow | `yellow` | 26 |
| Biscuit Brown | Skyline Brown | `brown` | 84 |
| Arc White | Whitest White (079) | `white` | 94 |
| Panda Two-Tone | High-Tech Two-Tone (2T7) | `white` over `black` | 42 |

**Where I am least confident on voice:** Fairground Yellow and Biscuit Brown (both risk being twee),
Chamois Yellow (garage-correct but obscure), Anniversary Blue (accurate to why the 22B exists, but a
player may read it as a trim level), and Shoreline Blue (close enough to the real name that it may
read as a dodge rather than a parody; `Wangan Blue` is the alternative and the game already uses
Wangan as a culture name).

**Deliberately not aliased**, though the research marks them iconic: Crystal White and Blaze Red on
the FC3S, Lime Green Two-Tone on the S13, Super White II on the JZA80, Pearl White on the S13, White
and Silver on the Hakosuka and the Kenmeri, Swan White on the Cosmo Sport. In each case the real
name is already generic in shape ("White", "Silver", "Crystal White"), so the palette's own name
carries it and an alias would add nothing but content to maintain.

---

## Two-tones

Six roster cars carry a factory two-tone, and one carries a body-and-roof pairing rule. The paint
design already gives every body zone its own colour and already collapses the `paint` band
worst-governs, so **a factory two-tone is representable**, but it collides with the existing two-tone
mismatch rule, which treats a colour disagreement between zones as a defect. **Sprint 170 has to
teach that rule the difference between a factory scheme and a bad respray.** Until it does, every
two-tone below has a single-colour fallback named.

| car | scheme | authored as | fallback |
| --- | --- | --- | --- |
| 42 AE86 Trueno GT-APEX | High-Tech Two-Tone (2T7): white upper body over black lower body and bonnet, the panda | `white` + `black` | `white` |
| 34 Autozam AZ-1 | every standard car is a body colour over Venetian Grey lower panels | `blue-rally` + `grey-mid`, `red` + `grey-mid` | `blue-rally`, `red` |
| 24 Delica Star Wagon | two-tone is the defining trait of the body style | `white` + `grey-mid`, `blue-rally` + `silver`, `green-dark` + `grey-mid`, `beige` + `brown` | the upper colour |
| 33 Land Cruiser 70 | white over beige | `white` + `beige` | `white` |
| 30 Nissan Safari | Blueish Green Pearl over Beige | `teal` + `beige` | `beige` |
| 22 Silvia K's (S13) | five of its colours are named as two-tones, and the research says several are a body colour over a contrasting lower section | the named colour, marked two-tone, **lower section not established** | the named colour |
| 47 Mini Cooper S Mk1 | a sourced pairing rule, not a scheme: Tartan Red and Old English White bodies take a black roof, every other body takes an Old English White roof | body colour + roof per the rule | body colour |

**Two two-tones could not be authored and are dropped:**

- **Chaser Tourer V (JZX100), Prestigious Pearl Toning (2CF).** The research establishes that it is a
  two-tone and that **its component shades could not be established**. There is nothing to author. It
  is out of the pool and stays out until someone finds a swatch.
- **Alcyone SVX Version L, the silver-and-grey factory two-tone.** It is well attested (three
  independent Japanese sources) and it is genuinely JDM-only, but **the panel arrangement is not
  established**, so which zone takes which colour is unknown. Authored as `silver` with the two-tone
  recorded in the notes rather than guessed at.

**Also unrepresentable, and dropped for a different reason:** the LFA's Matte Black (9K4). The finish
ladder is solid, metallic and pearl; there is no matte. The Pearl Grey over Steel Grey two-tone
(L383) goes with the rest of the LFA special-order range.

---

## What was dropped, and why

### Never built, or never a factory option

These are the ones the brief exists to catch. **None goes in a pool.**

| colour | car | why |
| --- | --- | --- |
| Light Green Metallic (6R0) | 51 Celica GT-Four ST205 | catalogued and **zero units built** |
| "Aflare Gold" and the gold cars | 93 Toyota 2000GT | three cars, all show cars; Japanese sources describe the finish as closer to ochre than gold. Gold was never a catalogue colour |
| Red | 87 Kenmeri GT-R | seven cars, all custom orders. The GT-R catalogue listed no colour options at all and showed only silver |
| Astral Silver | 86 190 E Evo II | one uncorroborated secondary claim of two cars, contradicting every exclusivity source. If ever confirmed it describes two cars in the world, which is not a pool |
| Passionate Pink (9J4), Lavender (9J9), Moss Green (9K2) | 94 Lexus LFA | codes allocated, never used |
| the blue metallic and deep green of the Kenmeri range catalogue | 87 Kenmeri GT-R | they belong to the ordinary Kenmeri, not the GT-R |
| the light blue and light green prototypes | 85 Cosmo Sport 110S | pre-production cars, not catalogue colours |

### Wrong grade, wrong period, or wrong market

| colour | car | why |
| --- | --- | --- |
| Silver Metallic | 50 MR2 GT SW20 | exclusive to the Jan 1995 Bilstein Package on the naturally aspirated G-Limited |
| Orange Mica Metallic | 50 MR2 SW20 | belongs to the Dec 1997 final revision, outside the roster window |
| Winning Silver, Harbor Blue | 40 RX-7 GT-X FC3S | 1989-90 colours, absent from the June 1990 list |
| Noble Green Mica | 40 RX-7 GT-X FC3S | restricted to the Infini IV and Winning Limited |
| Beige Metallic | 54 Altezza RS200 Z Edition | belongs to the luxury AS200 grades |
| Dark Blue Pearl (TH1), Jet Silver Metallic (KG1) | 77 BNR32 | the Aug 1989 to Aug 1991 list; gone by the roster's window |
| Midnight Purple (LP2), Active Red, "Aztec Red" | 77 BNR32 | from `32gt-r.com`, which contradicts two dated catalogues and maps TH1 to the wrong name. LP2 is an R33-era colour |
| Greyish Blue Pearl (BL0) | 77 BNR32 | a special-order colour with no source for which years or grades could order it |
| Championship Blue | 78 BCNR33 | the 1996 LM Limited, a separate limited grade |
| Millennium Jade (JW0), Silica Brass (EY0) | 83 BNR34 | the Nur and M-spec grades, not the V-spec II |
| Active Red (AR2), Sonic Silver (KR4), Lightning Yellow (EV1) | 83 BNR34 | the Jan 1999 to Aug 2000 V-spec list; dropped at the V-spec II |
| Super White | 44 Pulsar GTI-R | in the Aug 1993 JDM catalogue but present in no registry data. Left out and flagged rather than authored |
| Mariana Blue | 60 GTO Twin Turbo | edge-of-window (to Aug 1997, replaced by Timber Green) and no shade established |
| Quicksilver | 75 Supra RZ JZA80 | an American-market name that must not be imported onto a JDM car |
| the zenki codes (2N2, 038, 147, 3D7) | 42 AE86 | the roster window is entirely kouki, and every code changed at the May 1985 minor change |
| the base NSX palette | 88 NSX-R | gazoo listed the whole model's palette against the grade; Honda's own release calls Championship White the car's dedicated colour |
| the 1991 special-edition colours | 49 Alfa 75 3.0 V6 | they belong to the 2.0 TS and 1.8 cars |
| grey, yellow, orange, cream, metallic wine red | 85 Cosmo Sport 110S | mentioned by auction and secondary sources on individual cars, corroborated by no catalogue source |

### Trimmed rather than dropped

Three cars had lists far longer than any pool needs, and were cut to what survives merging plus what
is recognisable:

- **82 Porsche 930**: the 1986 chart's nine-colour special-order metallic range is cut to silver,
  brown and maroon. Paint to Sample means an individual 930 may legitimately wear a colour on no
  chart at all, which the pool does not attempt to model.
- **90 Ferrari F355**: twenty researched names to thirteen pool entries. Three blues (Swaters, Le
  Mans, Scuro) become one navy; three azzurros become one pale blue; two verdes become one dark
  green; Barchetta and Rubino become one maroon.
- **94 Lexus LFA**: the roughly twenty special-order colours are cut to Orange, which is the one with
  real recognition through the Nurburgring Package. The ten standard colours all survive.

---

## The per-car pools

All 94 roster rows. **Basis** carries the research confidence through, so a pool built on a "typical"
list is visibly not the same thing as one built on a dated catalogue:

| basis | meaning |
| --- | --- |
| **catalogue** | a dated per-grade catalogue, a factory press release or a production registry. The research's "solid" |
| **partial** | real sources with named gaps: cross-referenced codes, sampled periods, one market only |
| **list** | the shallow pass found a real colour list for this car or its exact model family and era |
| **typical** | the shallow pass found no list. The pool is a labelled placeholder: what a car of this maker, class, price and era was ordinarily sold in |
| **thin** | one colour name is attested and the rest of the palette is not established |
| **provisional** | the research established that a list exists and how long it is, but **did not record the names**. The pool is my construction and must not be shipped as researched |

`+` marks a two-tone. `*` marks an entry with a flag in the notes.

| # | car | basis | pool | notes |
| ---: | --- | --- | --- | --- |
| 1 | Honda Today (JW1) | typical | white, silver, red, blue-pale, beige, blue-navy, black | |
| 2 | Honda City E (AA) | typical | blue-pale, white, red, yellow, lime, silver, black | Miami Blue is confirmed for 1984; the rest is the pastel-heavy City palette |
| 3 | Nissan Sunny (B12) | list | red, blue-pale, silver, grey-mid, green-sage, black, white | Bluish Silver merges into `silver` |
| 4 | Honda Acty (HA4 Truck) | typical | white, blue-pale, silver, beige, green, red | overwhelmingly a white truck |
| 5 | Nissan March (K10) | typical | white, black, silver, green, red, blue-pale, beige | white, black, silver and green metallic are confirmed for the era |
| 6 | Toyota Corolla 1.5 SE (AE91) | list | white, green-sage, blue-navy, rose-dusk, grey-mid, red-deep, beige | |
| 7 | Mazda Familia 1.5 (BG) | list | white, silver, red, blue-rally, black, green, rose-dusk | |
| 8 | Suzuki Wagon R (CT21S) | typical | white, silver, blue-pale, red, green-dark, beige, yellow | |
| 9 | Honda Civic 1.5 (EF2) | list | white, silver, red-deep, blue-navy, grey-mid, gunmetal, white-ivory, yellow | the list is the EF generation's factory list, not JDM-only |
| 10 | Toyota Carina (AT150) | typical | white, silver, beige, blue-navy, grey-mid, red, silver-warm | white and silver confirmed for 1986 |
| 11 | Daihatsu Mira TR-XX (L70) | typical | white, red, black, silver, blue-navy, grey-mid | |
| 12 | Honda City Turbo II (AA) | typical | white, blue-rally, silver, red, black, yellow | Greek White, Tonic Blue and Quartz Silver recur in period references |
| 13 | Nissan S-Cargo | typical | beige, white, green-sage, blue-pale, grey-mid | short on purpose: a garish S-Cargo reads wrong |
| 14 | Toyota Sera (EXY10) | list | lime, blue-rally, cyan, maroon, gunmetal, silver | these six covered about 12,000 of 15,852 built |
| 15 | Subaru Vivio RX-R (KK4) | list | white, black, red, silver | six researched names merge to four: Vivien and Splendor Red are one red, Bright and Stream Silver one silver |
| 16 | Suzuki Jimny (JA11) | typical | white, green-sage, silver, beige, red, blue-navy, black | army green confirmed on JA11s |
| 17 | Suzuki Alto Works (HA21S) | typical | white, black, silver, red, blue-rally, yellow | |
| 18 | Daihatsu Mira TR-XX Avanzato R (L502S) | typical | white, black, silver, red, green-dark, purple-deep | the purple and dark green metallics are the period Daihatsu signature, unconfirmed for this car |
| 19 | Eunos Roadster (NA6CE) | list | red, white, blue-rally, silver, yellow, lime, black, blue-deep | |
| 20 | Honda CR-X SiR (EF8) | typical | red, white, silver, gunmetal, blue-deep, black, yellow | red, white and black confirmed on EF8s |
| 21 | Honda Prelude Si VTEC (BB4) | list | white, red, black, green-dark, silver, maroon, blue-deep | |
| 22 | Nissan Silvia K's (S13) | catalogue | white-ivory+*, white (pearl), red, blue-rally*, green-dark, lime+, black, maroon, silver+, silver-violet+, silver-warm+, gunmetal | union of the Feb 1990 and Jan 1992 lists, both inside the window. **Velvet Blue's depth and finish are not established** and `blue-rally` is provisional for it. Five colours are two-tones with the lower section unestablished. No paint code for any S13 colour |
| 23 | Toyota MR2 (AW11) | list | white, black, red-deep, blue-pale, red, blue-rally, grey-mid, silver | |
| 24 | Mitsubishi Delica Star Wagon (P35W) | typical | white+grey-mid, blue-rally+silver, green-dark+grey-mid, beige+brown, silver, white | two-tone is the defining trait; blue two-tone and green-over-grey confirmed on 1990 cars |
| 25 | Mazda Familia GT-R (BG8Z) | list | white, black, silver, red | four by fact, not by thin research |
| 26 | Honda Beat (PP1) | list | yellow, red, white, silver, black, green, blue-navy, green-dark | Carnival Yellow was by far the most common |
| 27 | Nissan Cefiro (A31) | list | white (solid and pearl), black, gunmetal, silver-violet, silver, maroon, green-sage, blue-navy | Greenish Silver merges into `silver`: a green cast is the least readable of the three silver casts at four tones. A two-tone white was also offered |
| 28 | Suzuki Cappuccino (EA11R) | list | silver, red, green, blue-rally, black, white | silver and red were the export pair; Japan got the other three |
| 29 | Honda Civic SiR-II (EG6) | typical | white, red, black, blue-deep, green, silver, purple-deep | the sources themselves admit the EG6 record is patchy |
| 30 | Nissan Safari (Y60) | typical | beige, black, gunmetal, white, teal+beige, blue-navy, red-deep | the green-over-beige two-tone is attested; the full chart was not retrieved |
| 31 | Toyota Starlet Glanza V (EP91) | list | white, silver, black, red, blue-violet | the palette really was this narrow |
| 32 | Datsun 510 Bluebird SSS | list | white, white-ivory, yellow, red-deep, green-sage, blue-pale, blue-navy, brown | trimmed from a 24-name 1968-1973 list |
| 33 | Toyota Land Cruiser 70 (LJ71) | typical | white, grey-mid, beige, green-dark, blue-navy, silver, white+beige | white and Bluish Gray Metallic confirmed for 1992 |
| 34 | Autozam AZ-1 (PG6SA) | list | blue-rally+grey-mid, red+grey-mid | two by fact: every standard car left the factory as one of these, always with grey lower panels |
| 35 | Nissan Laurel Club S (C33) | typical | black, white (solid and pearl), blue-navy, silver, gunmetal, maroon | borrowed from the contemporary A31, which shared Nissan's saloon palette |
| 36 | Nissan 180SX (RPS13) | partial | red, green-dark, black, silver-warm, gunmetal, white (solid and pearl), silver-violet, blue-navy | **A roster problem, not a colour problem: "Type II, 1993-1996" is not a real grade and date pairing.** Type II was catalogued for 1991-92 only; from 1994 the turbo grades were Type R and Type X. Most codes are cross-referenced from other Nissans. Whether Midnight Purple (LP2) was ever offered on a 180SX in the window is unresolved, so it is **not** in the pool |
| 37 | Toyota Aristo 3.0V (JZS147) | list | black, silver, gunmetal, teal, blue-navy, grey-mid, green-dark | 1993/08 standard and optional colours |
| 38 | VW Golf GTI 16V (Mk2) | partial + padded | red*, purple-deep*, green*, black, white, silver, blue-navy | **No source anywhere gives a German-market list for the 16V trim.** Only three colours are attested: Tornado Red (on every 16V list in every market and year checked), Dark Violet pearl (the Fire and Ice colour) and Capri Green. The remaining four are typical-pass padding and are labelled as such |
| 39 | Daihatsu Copen (L880K) | list | white (solid and pearl), silver, red, yellow, black, green-dark, blue-navy | |
| 40 | Mazda Savanna RX-7 GT-X (FC3S) | catalogue | white, red-deep, black, green-dark*, blue-navy, silver | the 1990 Blaze Red mix is darker and blacker than the 1989 mix of the same name, hence `red-deep`. **Shade Green's hue is not established**; `green-dark` is provisional for it and rests on nothing but the name |
| 41 | Toyota Chaser Tourer V (JZX90) | partial | white, teal, grey-mid, gunmetal, silver, green-dark*, green-sage | codes almost entirely missing: every Japanese code database starts at the 1996 X100. What "M.I.O." denotes is unknown |
| 42 | Toyota Sprinter Trueno GT-APEX (AE86) | partial | white+black, white, black, red, silver | the two-tone was standard-selectable on GT-APEX. Whether any two-tone other than white-over-black was offered on the kouki car is not established |
| 43 | Eunos Cosmo 20B Type S (JC) | partial | red, blue-rally, black, blue-navy, yellow-soft, grey-mid, rose-dusk, silver | union of the 1990.03 and 1991.01 lists. **A scope correction: the 20B Type S ran to 1994.03, not 1995**, so the roster's end year is wrong. **No paint code and no shade description was found for any Cosmo colour**, only the family labels, and no iconic colour could be established with a source |
| 44 | Nissan Pulsar GTI-R (RNN14) | catalogue | black, blue-rally*, red, silver, grey-mid | the best-sourced car found: a registry with per-code production counts (Super Black 60.6 per cent, Blue 14.1, Red 6.1, Silver 5.9, Grey 2.4, Mist Grey 0.7). **The shades of TJ1 Blue, 531 Silver and KJ7 Grey are not established**; TJ1 is the WRC colour and `blue-rally` is provisional for it. KJ7 Grey and Mist Grey Metallic (DL2) both merge into `grey-mid`: two greys with no shade evidence between them do not survive as two |
| 45 | Subaru Alcyone SVX Version L | catalogue | black, white, maroon, gunmetal, silver* | **Crimson Mica, Red Mica and Bordeaux Mica merge into one maroon**, which the research licenses directly: they are reportedly hard to tell apart in dull light. Red Mica is the rarest and least popular SVX colour. The genuine JDM-only silver-and-grey two-tone is recorded but **its panel arrangement is not established** |
| 46 | Mitsubishi Starion GSR-VR (A187A) | catalogue | white, red, black, silver, grey-mid | all five are manufacturer-standard with **no pearl or metallic markers**, so the whole pool is solid. A window correction: the archives record E-A187A as April 1988 to February 1990 |
| 47 | 1965 Mini Cooper S (Mk1) | partial | red, white-ivory, green, cyan (+ roof per the pairing rule) | **only four of the eight sourced names were carried into the research file.** Almond Green is medium dark, not light; Old English White is a cream; Surf Blue leans turquoise. Roof rule: Tartan Red and Old English White bodies take a black roof, every other body takes an Old English White roof |
| 48 | Nissan Silvia K's (S14, '94) | catalogue | red, teal, black, blue-violet, silver, white (pearl) | the May 1995 K's list, the safest core for a zenki car. The June 1996 list drops both those blues for Deep Marine Blue and Green Pearl and **may already be the kouki car**. LP2 also ran on the S14 in the period but is not on this grade's catalogue, so it is not in the pool |
| 49 | Alfa Romeo 75 3.0 V6 | partial + padded | red*, gunmetal*, white, black, silver, blue-navy | **nothing found is specific to the 3.0 V6.** Ten colours survive cross-checking but only two were carried into the research file: Rosso Alfa (555), the marque signature, and Grigio Canna di Fucile, recorded on one 1989 America. The remaining four are padding |
| 50 | Toyota MR2 GT (SW20 Rev.3) | catalogue | white, red, black, yellow, blue-rally, green-dark, grey-mid | Strong Blue Metallic (8B6) is the iconic one, introduced for Rev.3. Bluish Grey Argentum is 187, and Dark Green Mica is 6M1 here, not the 6Q7 the final-code-sheet databases carry |
| 51 | Toyota Celica GT-Four (ST205) | catalogue | white*, red, black, silver, yellow*, teal, green-dark, gunmetal, blue-rally | the best-documented car found. **White was WRC-only at launch**: the Feb 1994 standard GT-Four had no white at all. Super Bright Yellow: only 148 built. Deep Teal (752) and Greyish Turquoise (753) merge into one teal. Light Green Metallic (6R0) dropped: zero built |
| 52 | Mazda RX-7 Type R (FD3S, '92) | catalogue | red-deep, blue-deep, black, silver, yellow*, white* | the window crosses the Aug 1993 change. **Competition Yellow Mica existed only on the first twenty months of Type R**; Chaste White arrives at the same change. Montego Blue Mica is a dark blue with turquoise in it |
| 53 | Honda Civic Type R (EK9) | list | white-ivory, silver, black, yellow* | four and only four; Championship White is the signature and by far the commonest. Sunlight Yellow is facelift only |
| 54 | Toyota Altezza RS200 Z Edition (SXE10) | **provisional** | white, silver, black, red, gunmetal, green-dark, yellow, blue-navy | **The largest authoring hole in the set.** The research establishes thirteen colours across six sub-periods, narrowing from nine in 2001 to six in 2003 as the yellow and green drop, but **records none of the names**. This pool is a construction from the period Toyota sports-saloon palette and must not ship as researched. Two pearl-white codes are unresolved and the JDM-only codes have no swatch source |
| 55 | Honda Integra Type R (DC2, '99) | catalogue | white-ivory, red*, black, silver, yellow | only Championship White was standard; the other four were factory options. Milano Red was coupe only, not the saloon. **Use the JDM names**: the black is Granada Black Pearl at the 1995 launch and Starlight Black Pearl from 1998, not the Flamenco or Nighthawk of the English guides |
| 56 | Toyota Chaser Tourer V (JZX100) | **provisional** | white, silver, black, gunmetal, grey-mid, teal, green-dark, blue-navy, red-deep | the research is solid on names, codes and periods for eleven colours but **records only one of the names**. This pool is a construction. Prestigious Pearl Toning (2CF) is a two-tone whose component shades could not be established and is dropped |
| 57 | Subaru Impreza WRX STi Version (GC8) | partial | white, red, blue-deep, black, silver, yellow-soft, grey-mid | six numbered STi Versions across the window and **only two were sampled**. **The blue name changes across the window and none of them is "WR Blue"**: Version IV has Royal Blue Mica, the Type R Version VI has Grand Blue Mica, the 22B has Sonic Blue Mica. **The plain Version VI page lists no blue at all** while the Type R page of the same months does; an Impreza with no blue in its pool needs a human eye before it is authored |
| 58 | Nissan Fairlady Z Version S TT (Z32) | catalogue | red, black, silver, green, blue-navy, white (pearl), purple-deep*, yellow* | three dated catalogues for this exact grade. **Midnight Purple is confirmed from Jan 1997 and absent from Oct 1994**: a mid-life addition, not available across the whole window. Lightning Yellow arrives Oct 1998. Sonic Silver merges into `silver` |
| 59 | Honda Integra Type R (DC5) | catalogue | white-ivory, red, blue-rally*, black-blue, silver, blue-deep* | two lists either side of the Sep 2004 facelift, both confirmed against Honda's own archive. Arctic Blue Pearl is pre-facelift, Vivid Blue Pearl post. Honda's archive names the later silver Alabaster where gazoo names it Satin; both merge into `silver` anyway |
| 60 | Mitsubishi GTO Twin Turbo (Z16A) | catalogue | red, green-dark, black, silver, white (pearl) | Passion Red is the standard, no-cost colour and the one the car is pictured in. Its code is unresolved between R38 and R71 |
| 61 | Toyota Soarer 2.5 GT-T (JZZ30) | partial | white (pearl)*, red, maroon, rose-dusk, red-deep, green-dark, silver, black, gunmetal | **The one car where four entries from the same family is correct.** The four reds never overlap: Super Red IV runs throughout while Wine Red, Rose Red and Red Mica each occupy one period only, so **a JZZ30's red dates the car**. **It was never available in a solid white**: every white was a pearl and always a cost-extra option. The four non-red, non-white entries are provisional; the research is thin on shades |
| 62 | Nissan Silvia Spec-R (S15, '02) | catalogue | blue-deep, silver, white (pearl) | **three by fact.** The 2002 palette is much narrower than the S15's full run: the Oct 2000 Spec R Type B had seven, adding Active Red, Light Bluish Silver, Super Black and Lightning Yellow, all outside the roster's 2002 window |
| 63 | Mazda RX-8 Type RS (SE3P) | catalogue | red-deep, blue-rally, black, silver, white (pearl), grey-mid | the list changed at May 2009, not at the Mar 2008 facelift. **Its three greys become one**: Diamond Grey (38E), Galaxy Grey Mica (32S) and Metropolitan Grey Mica all land in `grey-mid`, which is rule 4 working rather than failing. Aluminium Metallic merges into `silver` |
| 64 | BMW M3 (E36, '97) | typical | white, blue-rally, purple-deep, black, silver, rose-dusk, green-dark, red | Estoril Blue and Techno Violet are confirmed as the facelift M3's signature pair; the rest are cross-reference names, not a factory chart |
| 65 | Mitsubishi Pajero Evolution (V55W) | list | white, silver, red, black | short on purpose: the homologation run was offered in very few |
| 66 | Lancia Delta HF Integrale Evo | list | white (solid and pearl), red, blue-navy, yellow*, blue-deep* | the standard Evo palette really was three solids; Gialla Ginestra, Blu Lagos and Bianco Perlato are the 1993 Evo 2 special editions, a few hundred cars each |
| 67 | Lancer Evo VI Tommi Makinen (CP9A) | catalogue | red, white, blue-rally, black, silver | **the Special Colouring Package is a one-colour grade**: its catalogue lists Passion Red and nothing else. Passion Red is a bright saturated **solid** with no metallic or pearl at all, and that flatness is why the car looks like the works machine. The roster window opens 1999 while gazoo dates the grade from Jan 2000 |
| 68 | BMW M3 (E30) | catalogue | white, red, silver-warm, silver, black, blue-violet, red-deep | **a clean example of the merge working.** Cinnabar Red (to 08/1989) and Brilliant Red (from 09/1989) become one `red`; Sterling Silver and Nogaro Silver become one `silver` while Salmon Silver stays separate on its warm cast. **The Sport Evolution came in exactly two colours**, Brilliant Red and Black II. Shade descriptions are inferred from names plus period photography, not from a written source |
| 69 | Lancer Evo VIII MR (CT9A) | catalogue | white, red, silver, silver-violet | **four colours, all standard, no options at all.** Mitsubishi did not sell an Evo VIII MR in blue, green, yellow or black: a black Evo VIII MR is not a factory car. Medium Purplish Grey Mica says what it is in its own name, and it is **the reason `silver-violet` exists as a palette entry**: merging it into a plain silver would rob a four-colour car of a quarter of its identity |
| 70 | Nissan Fairlady 240ZG (HS30-H) | partial | white, red, maroon | **three by fact.** Grand Prix Maroon was mixed specifically for the ZG at the direction of Nissan's colour designer. A dating conflict is recorded rather than papered over: one source puts Maroon and Red at the April 1973 change, which would make a 1971-72 ZG white only. For a car dated 1972-1973 the window spans the change either way |
| 71 | Autech Stagea 260RS (WGNC34) | list | white (pearl), white-ivory (pearl), black, silver, black-blue | White Pearl standard, the rest optional |
| 72 | Subaru Impreza WRX STI (GDB, '04) | catalogue | blue-rally, white, black, silver, grey-mid | one dated grade catalogue matching the roster window month for month. **"WR Blue Mica" is a GDB-era name** and is the wrong name on any GC8 |
| 73 | Ford Escort RS Cosworth | list | white, red, black, grey-mid, blue-rally, green-dark, purple-deep*, gunmetal* | six standard plus the Monte Carlo edition's Jewel Violet, Mallard Green and Ash Black |
| 74 | Nissan Fairlady Z (Z33, '02) | list | silver, white (pearl), black, grey-mid, red-deep, blue-rally, orange | 2003/10 Version S. Sparkling Silver merges into `silver`; Diamond Silver is a pale grey-silver and goes to `grey-mid` |
| 75 | Toyota Supra RZ (JZA80, '98) | catalogue | white, red, blue-rally, black, grey-mid, yellow, green-sage | two dated RZ catalogues covering 1997.08 to 2001.09 carry an identical seven-colour list. Greyish Green Mica Metallic is a muted green, as its name says, not a clean one. The final Sep 2001 to Aug 2002 RZ was not checked |
| 76 | Honda S2000 (AP1, '03) | partial | red, white (solid and pearl), black, silver, red-deep, blue-rally, blue-navy, lime, yellow, orange, grey-mid | **the longest pool of any JDM car here, and the reason its basis is partial rather than catalogue**: thirteen colours for one six-month grade is unusually many, and gazoo may be aggregating the model's options. Silverstone and Moonrock both merge into `grey-mid`. Jan to Sep 2003 is not covered by the catalogue found |
| 77 | Nissan Skyline GT-R (BNR32) | catalogue | gunmetal, white, red-deep, black, silver | Gun Grey Metallic (KH2) is **37 per cent of 1992 production** and the colour Nissan put in the brochures. **1992 itself is not directly catalogued**: gazoo jumps Aug 1991 to Feb 1993, and the Feb 1993 list stands as a proxy with the swap date unconfirmed |
| 78 | Nissan Skyline GT-R V-Spec (BCNR33) | catalogue | purple-deep, white, blue-navy, black, silver, gunmetal, red | **Midnight Purple is present from the January 1995 launch, standard, not a late addition**, and it is not V-spec exclusive: the plain GT-R carries the identical seven. At Feb 1997 Spark Silver becomes Sonic Silver and Super Clear Red becomes II, both of which merge. **LP2 is not GT-R exclusive**: it also ran on the 180SX, S14 and Z32, and its GT-R association is cultural rather than factual |
| 79 | Mazda RX-7 Spirit R Type A (FD3S) | catalogue | grey-titanium, white, red-deep, blue-rally, black | from Mazda's own press release of 25 March 2002. **Titanium Grey Metallic was a Spirit R exclusive**, it is what the last RX-7 off the Ujina line wore, and gazoo's grade page omits it entirely. The press release wins |
| 80 | Nissan Fairlady Z432 (PS30) | partial | grey-mid, red, yellow-soft, gold-ochre, white, green-dark, orange | the Z432 drew on the first-generation Z range's seven launch colours. **The Z432-R wore New Sight Orange with a dark gun-grey bonnet**, the most recognisable first-generation Z image there is: a two-tone worth authoring if the scheme model allows. Which of the seven survived the whole 1969-1973 life is not established; the S30 palette changed at least twice |
| 81 | Subaru Impreza 22B-STi | catalogue | blue-deep | **one colour. There is nothing to choose.** STI's own heritage page states the body colour was unified to Sonic Blue Mica across 400 JDM cars. Any other colour on a 22B is a respray, which is a fact the game can use rather than one to work around |
| 82 | Porsche 911 Turbo 3.3 (930) | partial | white, red, black, red-deep, blue-navy, beige, cyan, yellow, silver, brown, maroon | **the hardest car in the research**: eleven model years, an annually-changing chart, a large special-order range and Paint to Sample throughout. Only the 1986 chart could be sourced, so **1978-1985 and 1987-1989 are unrecorded**. The three that carry the car's identity are Guards Red, Grand Prix White and Black. Use the German-chart names: the US documentation renames Indischrot to Guards Red and shows "Alpine White (90E)" where the factory chart shows Grand Prix White (908) |
| 83 | Nissan Skyline GT-R V-Spec II (BNR34) | catalogue | blue-deep, black, silver, white (solid and pearl), purple-shift-green*, purple-shift-gold* | six standard from a dated catalogue, cross-checked against a registry accounting for all 14 R34 GT-R colours by code and count. Bayside Blue is **24.9 per cent of production** and plain White 25.8, so the two most famous facts about this car's colours are that one is common and the other is commoner. **Athlete Silver (KV2) and Sparkling Silver (WV2) both merge into `silver`.** Athlete Silver is filed under PURPLE on two grade pages and nothing else corroborates it; it is a silver, and an R34 in the purple bucket would be wrong on sight. The two Midnight Purples are limited factory colours absent from the standard grade catalogue: LV4 347 built, LX0 199, together 4.7 per cent of production. **LX0's start month is genuinely unresolved** (Japanese sources January 2000, English aggregators 2001-2002) and no window should be stated on this evidence |
| 84 | Skyline 2000GT-R Hakosuka (KPGC10) | partial | white, silver, brown* | **a three-colour car that becomes a two-colour car**: Skyline Brown was set only on the early hardtop GT-R and was gone by 1972. It sold so poorly that original-paint survivors are treated as near mythical. Its shade is the one genuinely sourced shade in the entry: a cream-like sheen, gentler and less yellow than Nissan's Safari Brown |
| 85 | Mazda Cosmo Sport 110S (Series II) | **thin** | white*, red*, silver* | **the weakest entry in the whole research, and the honest answer is that the list could not be closed.** Swan White is the only name found attached to the model in a source. The red and the silver are reported as available with no catalogue name found. The car needs a period Japanese catalogue scan or a marque registry |
| 86 | Mercedes 190 E 2.5-16 Evolution II | catalogue | black-blue | **one colour.** All 502 road cars left the factory in Blauschwarz Metallic 199, and that is the whole identity of the model's look |
| 87 | Skyline 2000GT-R Kenmeri (KPGC110) | catalogue | white, silver | 197 cars and the colour split is known car by car: about 130 white and about 70 silver. Silver is the only colour Nissan photographed the GT-R in. **Red was not a catalogue colour** (seven custom orders) and is dropped |
| 88 | Honda NSX-R (NA1) | catalogue | white-ivory | **one colour**, on Honda's own wording twice. Honda's Nov 1992 release calls it an ivory-white dedicated colour evoking the RA272. **The shade is sourced, not inferred: Honda itself says ivory white, not plain white**, which is why `white-ivory` is a separate palette entry |
| 89 | Nissan GT-R Black Edition (R35) | list | silver, grey-titanium*, gunmetal, black, white-ivory (pearl), red | six for 2009; Titanium was dropped for 2010 |
| 90 | Ferrari F355 Berlinetta | partial | red, yellow, black, silver, grey-titanium, grey-mid, white, blue-navy, blue-rally, blue-pale, maroon, green-dark, purple-deep | twenty researched names to thirteen entries. Codes and names are separately sourced and their pairing is not verified. Ferrari would also paint a car to order, so no list of this kind is closed |
| 91 | Ferrari 512 TR | typical | red, yellow, black, silver, blue-rally, grey-titanium, white | Rosso Corsa and Giallo Modena are confirmed for the 512 TR; the rest are standard period Ferrari colours not individually verified for this model |
| 92 | Lamborghini Countach LP5000 QV | partial | white, black, red, silver, blue-rally, blue-deep, gold-ochre, gunmetal, yellow* | the eight-colour chart is shared with the Jalpa and is undated within the Countach's run. **Giallo Fly is absent from that chart and belongs in the pool anyway**: a 1987 QV is recorded in it, six 25th Anniversary cars were built in it, and PPG went back to its archive for the formula. Sant'Agata would paint a Countach any colour for money |
| 93 | Toyota 2000GT (MF10) | catalogue | white, red, silver, yellow, green-dark, teal | the roster's car is the late type, so all six apply. Bellatrix Yellow, Atlantis Green and Twilight Turquoise were special-order only on the early car and were promoted to the catalogue for the late one. **Gold was never a catalogue colour** |
| 94 | Lexus LFA | partial | white (solid and pearl), silver, grey-mid, black, yellow-soft, brown, red, red-deep, blue-rally, orange* | ten standard colours plus Orange from the special-order range, which has real recognition through the Nurburgring Package (itself restricted to Red, Matte Black, Orange and Whitest White). **The naming caveat is the important part**: every standard name except Whitest White comes from a US-market archive, and a code proves a colour exists without carrying a name across markets. The JDM names are unconfirmed |

### Pool counts by basis

| basis | cars |
| ---: | --- |
| catalogue | 29 |
| partial | 17 |
| list | 25 |
| typical | 20 |
| provisional | 2 |
| thin | 1 |
| **total** | **94** |

Two of the "partial" cars are mostly padding and are marked "partial + padded" in the table above
(38 Golf GTI 16V, 49 Alfa 75): a handful of attested colours each, with the rest of the pool filled
from the typical pass.

**54 of 94 pools rest on a real list for that car** (catalogue plus list). **17 more rest on real
sources with named gaps.** **23 do not**: 20 typical, 2 provisional, 1 thin.

Every count here is reproducible from the `factoryColoursBasis` column of the roster CSV, which is
where these values are canonical.

---

## What could not be resolved

Carried forward from the research, restated as authoring blockers rather than search failures.

**Three cars cannot be honestly authored from the research as it stands:**

1. **54 Altezza RS200 Z Edition.** Thirteen colours across six sub-periods, and not one name recorded.
2. **56 Chaser Tourer V (JZX100).** Eleven colours with solid names, codes and periods in the
   research pass, and only Prestigious Pearl Toning carried into the file.
3. **85 Cosmo Sport 110S.** One attested name in the world.

**Two more are short by an accident of note-taking rather than of research:** the **47 Mini Cooper S**
(eight sourced names, four recorded) and the **49 Alfa 75** (ten survive cross-checking, two
recorded). Both are cheap to close: the sources are cited in the research files.

**Shades that do not exist:**

- **Velvet Blue** (22 S13): depth and finish unresolved, and it is one of the more common S13 colours.
- **Blue TJ1** (44 Pulsar GTI-R): the WRC colour, 14.1 per cent of production, and no shade
  established. `blue-rally` is a guess dressed as a placement.
- **Shade Green GU** (40 FC3S): hue not established.
- **531 Silver and KJ7 Grey** (44 Pulsar GTI-R): shades not established.
- **Red** (87 Kenmeri) and **red / silver** (85 Cosmo Sport): names without shades. The Kenmeri red is
  dropped anyway.

**Judgement calls a maintainer may want to reverse:**

- **`silver-violet` as a palette entry.** It now rests on four colours whose own names say purplish
  (Purplish Grey LN1, two Purplish Silver two-tones, Medium Purplish Grey Mica), which is much firmer
  ground than the heading Athlete Silver was placed on. It is still four cars and no photographic
  source. If it goes, they gain a duplicate silver.
- **Three Midnight Purples as three palette entries.** LV4 and LX0 apply to one car each and to under
  five per cent of its production. Rule 5 justifies it; a leaner reading would give them one shifting
  purple between them.
- **`red-deep` versus `maroon`.** The boundary is "does it still read as red", and several colours sit
  near it: Rosso Rubino, Bordeaux Red Pearl, Cranberry Red, Wine Red.
- **The two-tone question.** Seven cars need it, one of them (34 AZ-1) has no single-colour car at
  all, and the mismatch rule currently treats zone disagreement as a defect. That is a Sprint 170
  decision and it is the one thing here that can make a pool wrong rather than merely thin.

**Roster corrections surfaced by this work, both outside the paint system:**

- **36 Nissan 180SX**: "Type II, 1993-1996" is not a real grade and date pairing.
- **43 Eunos Cosmo 20B Type S**: the grade ran 1990.03 to 1994.03, not to 1995.

---

## Next

1. The maintainer sweeps the parody names against the copy bar.
2. The five closable gaps above (cars 47, 49, 54, 56, and the LX0 window) get a short targeted search.
3. The ramps: four tones per palette colour, authored against the art bible. Sprint 169 is not done
   without them.
4. The pools go into `midnight-garage-roster.csv` as a `factoryColours` column, per directive 24, for
   all 94 rows at once.
5. Sprint 170 decides two-tones, weighting (the Kenmeri is two to one white over silver; the R34's
   purples are 4.7 per cent) and whether a pool entry carries its factory finish.

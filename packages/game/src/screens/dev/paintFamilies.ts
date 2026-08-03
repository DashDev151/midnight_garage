/**
 * The 34-colour palette's family grouping, for the paint palette dev screen's
 * swatch grid only. Presentation, not content: `paintColours.json` carries no
 * family field, so this module maps the palette's own ids onto the labels the
 * consolidated colour research groups them under.
 */
export interface PaintFamily {
  label: string
  ids: readonly string[]
}

export const PAINT_FAMILIES: readonly PaintFamily[] = [
  {
    label: 'Whites and silvers',
    ids: ['white', 'white-ivory', 'silver', 'silver-warm', 'silver-violet'],
  },
  {
    label: 'Greys and blacks',
    ids: ['grey-mid', 'grey-titanium', 'gunmetal', 'black', 'black-blue'],
  },
  { label: 'Earths', ids: ['beige', 'brown', 'gold-ochre'] },
  { label: 'Reds', ids: ['red', 'red-deep', 'maroon', 'rose-dusk'] },
  { label: 'Warm brights', ids: ['orange', 'yellow', 'yellow-soft'] },
  { label: 'Greens', ids: ['lime', 'green', 'green-sage', 'green-dark'] },
  { label: 'Blue-greens', ids: ['teal', 'cyan'] },
  { label: 'Blues', ids: ['blue-pale', 'blue-rally', 'blue-deep', 'blue-navy', 'blue-violet'] },
  { label: 'Purples', ids: ['purple-deep', 'purple-shift-green', 'purple-shift-gold'] },
]

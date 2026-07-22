import { z } from 'zod'

/**
 * Each auction tier's pool of fictional venue names (`docs/design/
 * selling-rework.md` section 4). A new save rolls one name per tier (seeded,
 * at `newGame`) and displays it wherever that tier's label renders - pure
 * flavour, no mechanics read a name, only the roll. Explicit per-tier keys
 * (not a generic `z.record`), matching this codebase's established
 * preference (`ByAuctionTierSchema`, economy.ts) for a missing tier to fail
 * validation rather than silently default to empty.
 */
export const VenueNamesSchema = z.object({
  'local-yard': z.array(z.string().min(1)).min(1),
  regional: z.array(z.string().min(1)).min(1),
  premium: z.array(z.string().min(1)).min(1),
  'collector-network': z.array(z.string().min(1)).min(1),
})

export type VenueNames = z.infer<typeof VenueNamesSchema>

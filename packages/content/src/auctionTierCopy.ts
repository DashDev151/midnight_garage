import { z } from 'zod'

/**
 * The locked-tier guarantor line for each auction tier that is NOT open by
 * default - auction access beyond the local yard is a guarantor mission, not
 * a reputation threshold. `local-yard` is absent on purpose - it is open
 * from day one and never renders locked copy. Explicit per-tier keys (not a
 * generic `z.record`), matching this codebase's established preference
 * (`ByAuctionTierSchema`, economy.ts; `VenueNamesSchema`, venueNames.ts) for
 * a missing tier to fail validation rather than silently render nothing.
 */
export const AuctionTierCopySchema = z.object({
  regional: z.string().min(1),
  premium: z.string().min(1),
  'collector-network': z.string().min(1),
})

export type AuctionTierCopy = z.infer<typeof AuctionTierCopySchema>

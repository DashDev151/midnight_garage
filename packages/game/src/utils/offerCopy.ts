import { formatYen } from './formatYen'

/**
 * "A tuner is offering ¥1,240,000 for the FC. Today only." (Sprint 31
 * decision 5) - the one place this sentence is built, reused by both the
 * live offers panel (`gameStore.ts`'s `pendingOffersView`/`offerFor`) and
 * the end-of-day report line (`dayLogFormat.ts`'s `offer-received` case) so
 * the two can never drift apart. `buyerDisplayName` is the catalog's own
 * capitalized form ("Tuner", "Collector", ...); lower-cased here so it reads
 * as a sentence, not a label.
 */
export function offerCopy(
  buyerDisplayName: string,
  carDisplayName: string,
  priceYen: number,
): string {
  return `A ${buyerDisplayName.toLowerCase()} is offering ${formatYen(priceYen)} for the ${carDisplayName}. Today only.`
}

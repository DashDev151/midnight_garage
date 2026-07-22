import type { EconomyConfig, SellingChannelId } from '@midnight-garage/content'
import { formatYen } from './formatYen'

/** One channel's own config shape (`economy.sellingChannels[id]`) - the
 * channel picker's own read, never a hand-authored copy of the schema. */
type SellingChannelConfig = EconomyConfig['sellingChannels'][SellingChannelId]

/**
 * Player-facing names for the five listing channels. The camelCase id
 * ("freeAdsPaper") is a schema identifier, never copy - any screen that
 * shows a channel to the player renders it through this map, mirroring
 * `AUCTION_TIER_LABELS`'s own precedent.
 */
export const SELLING_CHANNEL_LABELS: Record<SellingChannelId, string> = {
  shopFront: 'Shop front',
  freeAdsPaper: 'Free ads paper',
  tunerMagazine: 'Tuner magazine',
  tradeNetwork: 'Trade network',
  weekendMeet: 'Weekend meet',
}

/** The channel picker's own fixed display order - shop front first (the
 * free, default channel), matching the lever list's own table order. */
export const SELLING_CHANNEL_ORDER: readonly SellingChannelId[] = [
  'shopFront',
  'freeAdsPaper',
  'tunerMagazine',
  'tradeNetwork',
  'weekendMeet',
]

/** "Free" or "X yen per listing" - the channel's own fee, read straight
 * from content, never a hardcoded figure. */
export function sellingChannelFeeLabel(channel: SellingChannelConfig): string {
  return channel.feeYen === 0 ? 'Free' : `${formatYen(channel.feeYen)} per listing`
}

/**
 * A short, mechanical cadence fact - which cadence shape the channel config
 * carries, and whether it's matched-only - never authored flavour prose (the
 * persona want-lines are the only hand-written copy this feature adds).
 */
export function sellingChannelCadenceLabel(channel: SellingChannelConfig): string {
  if (channel.oneDrawNextEndDay) {
    return channel.matchedOnly
      ? 'One draw next End Day, matched buyers only'
      : 'One draw next End Day'
  }
  if (channel.priceBand) {
    return `${channel.priceBand.min}x-${channel.priceBand.max}x of value, guaranteed`
  }
  if (channel.matchedOnly) return 'Daily chance, matched buyers only'
  if (channel.offerChanceFactorByTierClass) return 'Daily chance, by car tier'
  return 'Daily chance'
}

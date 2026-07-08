import type { CarModel } from './carModel'

/**
 * Naming Layer (GDD 2.4, roadmap risk R5). `spec` fields on a CarModel are
 * real, unprotectable facts; displayName/brand vs parodyName/parodyBrand
 * are the only fields this flip touches. One constant, one redeploy — see
 * the leak test in tests/naming.test.ts for the CI guarantee.
 */
export type NamingMode = 'real' | 'parody'

export const NAMING_MODE: NamingMode = 'real'

export function resolveCarDisplayName(model: CarModel, mode: NamingMode = NAMING_MODE): string {
  return mode === 'parody' ? model.parodyName : model.displayName
}

export function resolveCarBrand(model: CarModel, mode: NamingMode = NAMING_MODE): string {
  return mode === 'parody' ? model.parodyBrand : model.brand
}

/**
 * Real manufacturer and model-name substrings that must never survive a
 * parody-mode resolution. Deliberately case-insensitive substring
 * matching in the leak test — over-flagging is safe, a miss is not.
 */
export const REAL_BRANDS = ['Honda', 'Toyota', 'Nissan', 'Mazda', 'Suzuki'] as const

export const REAL_MODEL_TOKENS = [
  'City',
  'Wagon R',
  'Civic',
  'Sprinter Trueno',
  '180SX',
  'Chaser',
  'Silvia',
  'Savanna',
  'RX-7',
  'Supra',
] as const

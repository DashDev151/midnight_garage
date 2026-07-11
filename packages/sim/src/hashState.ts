/**
 * Deterministic string hash (FNV-1a) over a canonical JSON serialization
 * of a value - used for golden-master state comparisons. Object keys are
 * sorted first so field-order churn from spreading never changes the
 * hash; only the actual data does.
 */
export function hashState(value: unknown): string {
  const json = JSON.stringify(sortKeysDeep(value))
  let hash = 0x811c9dc5
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key])
    }
    return sorted
  }
  return value
}

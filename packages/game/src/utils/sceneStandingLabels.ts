import type { SceneStandingStage } from '@midnight-garage/content'

/**
 * The words for each scene-standing stage - the ledger panel's only source
 * of stage copy, so the same plain sentence appears everywhere a stage is
 * named. No number anywhere: a stage is read, never counted.
 */
export const SCENE_STANDING_STAGE_COPY: Record<SceneStandingStage, string> = {
  none: "They don't know your shop yet.",
  known: 'Known in this scene.',
  respected: 'Respected in this scene.',
  shop: "This is your shop, as far as they're concerned.",
}

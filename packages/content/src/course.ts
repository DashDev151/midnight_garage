import { z } from 'zod'

/**
 * A course is a diegetic run the lap model marches a car over. The physics
 * (corner apex speed from grip, straight time from pace) lives in the sim;
 * content only carries the shape. Times are never authored here - they are
 * always the live output of `lapModel.ts` running a car against a course, so a
 * `courseId` requirement (`requirements.ts`) selects the shape a lap is
 * measured on.
 *
 * Two kinds, because a road with no corners cannot be written as one with them:
 *
 * - `lap` is an ordered list of corner-then-straight segments, run as a flying
 *   lap that wraps (the straight after the last segment leads into the first
 *   corner's apex).
 * - `standing-km` is a straight-line run of `lengthM` from a standstill, with
 *   no segments at all. A zero-angle segment would NOT express it: the lap
 *   walker still enters a segment's straight at that segment's apex speed,
 *   which would make the run a flying kilometre rather than a standing one.
 */

/** [corner radius m, corner angle deg, following straight m]. */
export const SegmentSchema = z.tuple([
  z.number().positive(),
  z.number().positive(),
  z.number().nonnegative(),
])

export const CourseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
    name: z.string().min(1),
    kind: z.enum(['lap', 'standing-km']),
    segments: z.array(SegmentSchema),
    /** Run length in metres. A `standing-km` course states it; a `lap` course's
     * length is its own geometry, so it must not. */
    lengthM: z.number().positive().optional(),
    /** Where this geometry came from. Never rendered anywhere: it exists so
     * that a warning about a searched, non-surveyed geometry cannot be
     * separated from the numbers it warns about. */
    geometryNote: z.string().min(1).optional(),
  })
  .refine((c) => (c.kind === 'lap' ? c.segments.length >= 1 : c.segments.length === 0), {
    message: 'a lap course needs at least one segment; a standing-km course carries none',
    path: ['segments'],
  })
  .refine((c) => (c.kind === 'standing-km' ? c.lengthM != null : c.lengthM == null), {
    message: 'lengthM belongs to a standing-km course only; a lap course is measured by its shape',
    path: ['lengthM'],
  })

export const CoursesSchema = z.array(CourseSchema).min(1)

export type Course = z.infer<typeof CourseSchema>
export type CourseSegment = z.infer<typeof SegmentSchema>

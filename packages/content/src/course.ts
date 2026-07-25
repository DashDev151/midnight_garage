import { z } from 'zod'

/**
 * A course is a diegetic run the lap model marches a car over: an ordered
 * list of corner-then-straight segments. The physics (corner apex speed from
 * grip, straight time from pace) lives in the sim; content only carries the
 * shape. Times are never authored here - they are always the live output of
 * `lapModel.ts` running a car against a course, so a `courseId` requirement
 * (`requirements.ts`) selects the shape a lap is measured on.
 */

/** [corner radius m, corner angle deg, following straight m]. */
export const SegmentSchema = z.tuple([
  z.number().positive(),
  z.number().positive(),
  z.number().nonnegative(),
])

export const CourseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids are kebab-case: lowercase letters, digits, hyphens'),
  name: z.string().min(1),
  segments: z.array(SegmentSchema).min(1),
})

export const CoursesSchema = z.array(CourseSchema).min(1)

export type Course = z.infer<typeof CourseSchema>
export type CourseSegment = z.infer<typeof SegmentSchema>

// Changed routes have their own records; earlier runs remain stored intact.
export const COURSE_VERSION = 'playground-v2';
export const PERSONAL_BEST_PREFIX = 'mirio-time-best-v2:';

export const COURSE = Object.freeze({LEGACY: COURSE_VERSION, DISCOVERY: 'discovery-v3',
  CLASSIC: 'classic-v3', BRANCHES: 'branches-v3', PINBALL: 'pinball-v3', JOURNEY: 'journey-v3'});
const CURRENT = Object.freeze({adventure: COURSE.DISCOVERY, kart: COURSE.CLASSIC, marble: COURSE.PINBALL,
  sky: COURSE.JOURNEY, ribbon: COURSE.JOURNEY});

export function courseFor(level) { return Object.hasOwn(CURRENT, level) ? CURRENT[level] : COURSE.LEGACY; }

// Unchanged outings keep their existing keys; changed courses never overwrite an archive.
export function personalBestKey(level, course = courseFor(level)) {
  return course === COURSE.LEGACY ? PERSONAL_BEST_PREFIX + level : `mirio-time-best:${course}:${level}`;
}

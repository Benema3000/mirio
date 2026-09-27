// Local best times only; public entries are always explicitly submitted by
// the player. No placeholder scores or cross-level comparisons are invented.
import { PERSONAL_BEST_PREFIX } from './course-version.js';

const LEVEL_IDS = new Set(['adventure', 'sky', 'ribbon', 'kart', 'marble', 'tilt']);
const MAX_TIME_MS = 24 * 60 * 60 * 1000;
const KEY_PREFIX = PERSONAL_BEST_PREFIX;
const memory = new Map();

const validTime = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_TIME_MS;

/** Hundredths are truncated so a live clock never displays time early. */
export function formatRunTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '--:--.--';
  const hundredths = Math.floor(milliseconds / 10);
  const minutes = Math.floor(hundredths / 6000);
  const seconds = Math.floor(hundredths / 100) % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`;
}

export function readPersonalBest(level) {
  if (!LEVEL_IDS.has(level)) return null;
  let best = memory.get(level) ?? null;
  try {
    const stored = globalThis.localStorage?.getItem(KEY_PREFIX + level);
    // Reject partially numeric strings, old JSON objects and damaged entries.
    if (typeof stored === 'string' && /^\d+$/.test(stored)) {
      const value = Number(stored);
      if (validTime(value) && (best === null || value < best)) best = value;
    }
  } catch { /* Private browsing still keeps a best for this session. */ }
  if (best !== null) memory.set(level, best);
  return best;
}

export function savePersonalBest(level, timeMs) {
  const previous = readPersonalBest(level);
  if (!LEVEL_IDS.has(level) || !validTime(timeMs) || (previous !== null && timeMs >= previous)) {
    return { best: previous, previous, isNew: false };
  }
  memory.set(level, timeMs);
  try { globalThis.localStorage?.setItem(KEY_PREFIX + level, String(timeMs)); } catch { /* Session best survives a full/blocked store. */ }
  return { best: timeMs, previous, isNew: true };
}

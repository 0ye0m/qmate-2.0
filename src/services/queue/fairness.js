/**
 * Fair-play priority ordering.
 *
 * Priority tokens (differently-abled / emergency / faculty) jump the line,
 * BUT at most 1 priority per N standard tokens (default N=4) to prevent
 * abuse. `recentlyCalled` is the queue's most-recently-called tokens, so the
 * check is stateless — derived from history at call time.
 */
import { PRIORITY_FAIR_RATIO } from '../../utils/constants';

function isPriority(t) {
  return t && t.priority && t.priority !== 'none';
}

/**
 * @param {Array} waiting        waiting tokens sorted by number asc (already filtered for step-away)
 * @param {Array} recentlyCalled tokens called most-recent-first
 * @param {number} ratio         min standard tokens between two priority picks
 */
export function pickNextToken(waiting, recentlyCalled = [], ratio = PRIORITY_FAIR_RATIO) {
  if (!waiting.length) return null;
  const priority = waiting.filter(isPriority);
  if (!priority.length) return waiting[0];

  // Priority is "on cooldown" only while fewer than `ratio` standard tokens
  // have been called since the last priority call. Empty history → no
  // cooldown → a waiting priority token earns the head of the line.
  let standardsSince = 0;
  let onCooldown = false;
  for (const t of recentlyCalled) {
    if (isPriority(t)) {
      onCooldown = true;
      break;
    }
    standardsSince += 1;
    if (standardsSince >= ratio) {
      onCooldown = false;
      break;
    }
  }
  if (!onCooldown) return priority[0];

  const standards = waiting.filter((t) => !isPriority(t));
  return standards[0] || priority[0];
}

/** Effective display position of a token within a waiting list. */
export function effectivePosition(waitingSorted, tokenId) {
  const idx = waitingSorted.findIndex((t) => t.id === tokenId);
  return idx;
}

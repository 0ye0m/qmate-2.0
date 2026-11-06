/**
 * FEEDBACK — students rate a completed visit (1–5 + comment). Sentiment and
 * themes are classified by Gemini in the background (anonymized) with a
 * keyword-lexicon fallback; admins see aggregated top issues.
 */
import { storage } from '../storage';
import { eventBus, EVENTS } from '../realtime/EventBus';
import { uid } from '../../utils/id';

const POSITIVE = ['fast', 'quick', 'good', 'great', 'helpful', 'smooth', 'excellent', 'easy', 'nice', 'best', 'जल्दी', 'अच्छा', 'बढ़िया', 'छान', 'वेगवान'];
const NEGATIVE = ['slow', 'rude', 'delay', 'wait', 'crowd', 'closed', 'problem', 'issue', 'bad', 'worst', 'confusing', 'long', 'धीमा', 'बंद', 'समस्या', 'इंतज़ार', 'वाईट'];
const THEMES = [
  ['staff', ['staff', 'rude', 'polite', 'helpful', 'behaviour', 'कर्मचारी', 'वर्तन']],
  ['speed', ['slow', 'fast', 'quick', 'speed', 'delay', 'जल्दी', 'धीमा']],
  ['crowd', ['crowd', 'busy', 'rush', 'full', 'गर्दी', 'क्राउड']],
  ['documents', ['document', 'paper', 'form', 'photocopy', 'दस्तऐवज', 'कागद', 'दस्तावेज']],
  ['counter', ['counter', 'closed', 'open', 'काउंटर']],
  ['timing', ['time', 'hour', 'late', 'early', 'वेळ', 'समय']],
];

export function classifyLocally(comment, rating) {
  const text = String(comment || '').toLowerCase();
  let score = rating >= 4 ? 1 : rating <= 2 ? -1 : 0;
  if (POSITIVE.some((w) => text.includes(w))) score += 1;
  if (NEGATIVE.some((w) => text.includes(w))) score -= 1;
  const sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  const theme = THEMES.find(([, words]) => words.some((w) => text.includes(w)))?.[0] || 'general';
  return { sentiment, theme };
}

export async function add({ tokenId, queueId, userId, rating, comment = '' }) {
  const r = Math.max(1, Math.min(5, Math.round(Number(rating) || 0)));
  if (!r) throw new Error('Rating required');
  const existing = await storage.table('feedback').where('tokenId').equals(tokenId).first();
  if (existing) return existing;
  const local = classifyLocally(comment, r);
  const record = {
    id: uid('fb-'),
    tokenId,
    queueId,
    userId, // never leaves the device — AI receives comment text only
    rating: r,
    comment: String(comment).slice(0, 400),
    sentiment: local.sentiment,
    theme: local.theme,
    aiRefined: false,
    createdAt: Date.now(),
  };
  await storage.put('feedback', record);
  eventBus.publish(EVENTS.FEEDBACK_ADDED, { feedbackId: record.id, queueId });
  // background AI refinement (never blocks, never personal data)
  void (async () => {
    try {
      const { refineSentiment } = await import('../ai/aiFeatures');
      const refined = await refineSentiment([{ id: record.id, rating: r, comment: record.comment }]);
      if (refined && refined[0] && refined[0].sentiment) {
        await storage.table('feedback').update(record.id, {
          sentiment: refined[0].sentiment,
          theme: refined[0].theme || local.theme,
          aiRefined: true,
        });
        eventBus.publish(EVENTS.FEEDBACK_ADDED, { feedbackId: record.id, queueId, refined: true });
      }
    } catch {
      /* local classification already stored */
    }
  })();
  return record;
}

export async function hasRated(tokenId) {
  const row = await storage.table('feedback').where('tokenId').equals(tokenId).first();
  return !!row;
}

export async function myFeedbackFor(userId) {
  const rows = await storage.table('feedback').where('userId').equals(userId).toArray();
  return new Map(rows.map((r) => [r.tokenId, r]));
}

export async function listByQueue(queueId, limit = 100) {
  const rows = await storage.table('feedback').where('queueId').equals(queueId).toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** Aggregate: avg rating, counts, top themes (admin view). */
export async function stats(days = 30) {
  const since = Date.now() - days * 86400000;
  const rows = (await storage.getAll('feedback')).filter((r) => r.createdAt >= since);
  const byTheme = new Map();
  let neg = 0;
  for (const r of rows) {
    byTheme.set(r.theme || 'general', (byTheme.get(r.theme || 'general') || 0) + 1);
    if (r.sentiment === 'negative') neg++;
  }
  const avg = rows.length ? rows.reduce((a, b) => a + b.rating, 0) / rows.length : 0;
  return {
    count: rows.length,
    avgRating: Math.round(avg * 10) / 10,
    negative: neg,
    topThemes: [...byTheme.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    recent: rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20),
  };
}

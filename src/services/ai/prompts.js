/**
 * Prompt builders — strict JSON schemas, anonymized inputs only.
 * No names, emails or token-holder identities ever leave the device;
 * only queue metadata, aggregate counters and free-text the user typed.
 */
import { LANG_NAME } from './langNames';

const base = (lang) => `Reply language: ${LANG_NAME[lang] || 'English'}.`;

export const QBuddy = {
  system: `You are Q-Buddy, the friendly campus queue assistant for Q-Mate. You help students pick the right queue, list required documents, and choose low-crowd times. Be concise (max 80 words), warm, and practical. Never invent queues that are not in the provided context.`,
  build({ queues, windows, question, lang }) {
    const ctx = queues.map((q) => ({
      queue: q.name,
      department: q.department,
      status: q.status,
      currentWaitMin: q.etaMin,
      documents: q.requiredDocs,
      bestWindow: windows[q.id]?.[0] ? `${windows[q.id][0].from}-${windows[q.id][0].to}` : null,
    }));
    return `${base(lang)}
LIVE QUEUE CONTEXT (JSON, the only queues that exist):
${JSON.stringify(ctx)}

STUDENT QUESTION: ${question}

Respond ONLY with JSON: {"answer": string, "chips": string[]}
"chips" = 3 short follow-up suggestions in the same language.`;
  },
};

export const Checklist = {
  system: `You are a campus counter expert. Given a queue's required documents, produce a practical pre-visit checklist so the student is never rejected at the counter and never has to re-queue.`,
  build({ queue, lang }) {
    return `${base(lang)}
QUEUE: ${queue.name} (${queue.department})
ADMIN-REQUIRED DOCUMENTS: ${JSON.stringify(queue.requiredDocs)}

For each required document add one crisp preparation tip (photocopies, online pre-check, validity, signatures). You may add at most 2 extra optional items if genuinely useful.
Respond ONLY with JSON: {"items":[{"name":string,"tip":string,"mandatory":boolean}]}`;
  },
};

export const ParseQueue = {
  system: `You convert a college admin's one-line queue request into structured JSON. Today's date is provided; "tomorrow" means +1 day. Times are 24h HH:mm.`,
  build({ text, today }) {
    return `Today: ${today}. Request: "${text}"

Extract fields. If a value is missing use null (or [] for docs). department must be one of CSE, ECE, MECH, CIVIL, IT, MBA, SCI when inferable, else null.
Respond ONLY with JSON:
{"name":string,"department":string|null,"counters":number|null,"maxSlots":number|null,"date":string|null,"from":string|null,"to":string|null,"docs":string[],"confidence":number}`;
  },
};

export const Insights = {
  system: `You are a campus operations analyst. Given aggregate queue analytics (no personal data), write a crisp weekly summary and exactly 3 actionable recommendations for admin staff.`,
  build({ aggregates, lang }) {
    return `${base(lang)}
ANALYTICS (7-day aggregates): ${JSON.stringify(aggregates)}

Respond ONLY with JSON: {"summary": string, "recommendations": [string, string, string]}
Keep summary under 90 words, each recommendation under 25 words, concrete (mention counters/times).`;
  },
};

export const Sentiment = {
  system: `You classify student feedback (already anonymized) into sentiment and theme. Theme must be one of: staff, speed, crowd, documents, counter, timing, general.`,
  build({ items }) {
    return `FEEDBACK: ${JSON.stringify(items.map(({ id, rating, comment }) => ({ id, rating, comment })))}

Respond ONLY with JSON: {"items":[{"id":string,"sentiment":"positive"|"neutral"|"negative","theme":string}]}`;
  },
};

export const Announcement = {
  system: `You polish short campus announcements so every student instantly understands what changed, where, and until when. Keep it under 30 words per language. Do not add facts that are not in the draft.`,
  build({ text, lang }) {
    return `${base(lang)}
DRAFT NOTE: "${text}"

Polish it and translate to English, Hindi and Marathi.
Respond ONLY with JSON: {"en":string,"hi":string,"mr":string}`;
  },
};

/**
 * AI FEATURES — every Gemini-powered capability here has a deterministic
 * local fallback, so the app is fully functional offline / with zero keys.
 * Returned objects carry `mode: 'online' | 'fallback'` for the UI badge.
 */
import { generateJSON } from './geminiClient';
import { aiConfigured, aiMode } from './geminiClient';
import { repairJson } from '../../utils/jsonRepair';
import * as P from './prompts';
import { DEPARTMENTS } from '../../utils/constants';
import { todayStr, dateStrOf, hhmmToMinutes, minutesToHHmm } from '../../utils/format';

const ok = (data) => ({ ...data, mode: 'online' });
const fb = (data, error = null) => ({ ...data, mode: 'fallback', error });

async function tryJson({ system, prompt, temperature = 0.3 }) {
  const parsed = await generateJSON({ system, prompt, temperature });
  if (parsed == null) throw new Error('Unparseable AI response');
  return parsed;
}

/* ── 1. Q-Buddy chatbot ────────────────────────────────────────────────── */

const T = {
  en: {
    intro: "Hi! I'm Q-Buddy 🌿 Ask me which queue to visit, what documents you need, or the best time to go.",
    list: (qs) => `Live queues right now: ${qs}. Tell me your work (bonafide, fees, exam form…) and I'll point you to the right one.`,
    docs: (q, d) => `For **${q}**, carry: ${d.join(', ')}. Keep originals + one photocopy set ready.`,
    time: (q, w) => `Lowest crowd at **${q}** is around ${w.from}–${w.to} — roughly ${w.reductionPct}% shorter wait than average.`,
    none: "I couldn't match that to a queue. Try: “Which queue for bonafide?”, “Documents for fees?”, “Best time to visit?”",
    gone: (q) => `**${q}** is not accepting tokens right now. Please check back after staff reopens it.`,
  },
  hi: {
    intro: 'नमस्ते! मैं Q-Buddy हूँ 🌿 पूछिए — कौन सी कतार, कौन से दस्तावेज़, या सबसे कम भीड़ कब है।',
    list: (qs) => `अभी चालू कतारें: ${qs}। बताइए आपका काम (बोनाफाइड, फीस, परीक्षा फॉर्म…) और मैं सही कतार बताऊंगा।`,
    docs: (q, d) => `**${q}** के लिए लाएं: ${d.join(', ')}। असली + एक फोटोकॉपी सेट तैयार रखें।`,
    time: (q, w) => `**${q}** में सबसे कम भीड़ ${w.from}–${w.to} के आसपास रहती है — औसत से लगभग ${w.reductionPct}% कम इंतज़ार।`,
    none: 'यह किसी कतार से मेल नहीं खाया। पूछें: "बोनाफाइड के लिए कौन सी कतार?", "फीस के दस्तावेज़?", "सबसे अच्छा समय?"',
    gone: (q) => `**${q}** अभी टोकन नहीं दे रही है। कुछ देर बाद देखें।`,
  },
  mr: {
    intro: 'नमस्कार! मी Q-Buddy 🌿 विचारा — कोणती रांग, कोणती कागदपत्रे, किंवा कमी गर्दी कधी.',
    list: (qs) => `सध्या सुरू असलेल्या रांगा: ${qs}। तुमचे काम सांगा (बोनाफाइड, फी, परीक्षा फॉर्म…) आणि योग्य रांग सांगेन.`,
    docs: (q, d) => `**${q}** साठी आणा: ${d.join(', ')}. मूळ + एक झेरॉक्स सेट तयार ठेवा.`,
    time: (q, w) => `**${q}** येथे सर्वात कमी गर्दी ${w.from}–${w.to} च्या सुमारास — सरासरीपेक्षा जवळपास ${w.reductionPct}% कमी वाट.`,
    none: 'हे कोणत्याही रांगेशी जुळले नाही. विचारा: "बोनाफाइडसाठी कोणती रांग?", "फीसाठी कागदपत्रे?", "सर्वोत्तम वेळ?"',
    gone: (q) => `**${q}** सध्या टोकन देत नाहीये. थोड्या वेळाने पहा.`,
  },
};

const QUEUE_KEYWORDS = [
  ['bonafide|certificate|प्रमाणपत्र', /bonafide|certificate|प्रमाणपत्र/i],
  ['exam form|परीक्षा|फॉर्म', /exam\s*form|परीक्षा\s*फॉर्म/i],
  ['fee|fees|payment|फीस|शुल्क', /fee|payment|फीस|शुल्क/i],
  ['library|book|पुस्तक|ग्रंथ', /library|book|पुस्तक|ग्रंथ/i],
  ['admission|प्रवेश', /admission|प्रवेश/i],
  ['lab|kit|किट', /lab|kit|किट/i],
  ['canteen|lunch|food|भोजन|जेवण', /canteen|lunch|food|भोजन|जेवण/i],
];

function matchQueue(question, queues) {
  for (const [, re] of QUEUE_KEYWORDS) {
    if (re.test(question)) {
      const hit = queues.find((q) => re.test(q.name) || re.test(q.department));
      if (hit) return hit;
      const kw = re.source.split('|')[0];
      return queues.find((q) => q.name.toLowerCase().includes(kw));
    }
  }
  return queues.find((q) => question.toLowerCase().split(/\s+/).some((w) => w.length > 3 && q.name.toLowerCase().includes(w)));
}

const DOC_RE = /document|docs|paper|carry|लागतील|लागेल|दस्त|कागद|कागदपत्र/i;
const TIME_RE = /time|when|best|crowd|कब|समय|वेळ|गर्दी|भीड़/i;

async function localQbuddy({ question, queues, lang, windows }) {
  const t = T[lang] || T.en;
  const active = queues.filter((q) => q.status === 'active');
  const q = question.toLowerCase().trim();
  if (!q || /^(hi|hello|hey|namaste|नमस्ते|नमस्कार)/.test(q)) {
    return { answer: t.intro, chips: [] };
  }
  const hit = matchQueue(q, active.length ? active : queues);
  if (DOC_RE.test(q)) {
    if (hit) return { answer: t.docs(hit.name, hit.requiredDocs.length ? hit.requiredDocs : ['College ID card']), chips: [] };
    return { answer: t.none, chips: [] };
  }
  if (TIME_RE.test(q)) {
    const target = hit || active[0];
    const win = target ? windows[target.id]?.[0] : null;
    if (target && win) return { answer: t.time(target.name, win), chips: [] };
    if (target) return { answer: `${target.name}: ${target.etaMin ?? '—'} min right now.`, chips: [] };
    return { answer: t.none, chips: [] };
  }
  if (hit) {
    if (hit.status !== 'active') return { answer: t.gone(hit.name), chips: [] };
    const win = windows[hit.id]?.[0];
    return {
      answer: `${hit.name} (${hit.department}) — wait ≈ ${hit.etaMin ?? '—'} min${win ? `. Best window: ${win.from}–${win.to}` : ''}. ${t.docs(hit.name, hit.requiredDocs.length ? hit.requiredDocs : ['College ID card'])}`,
      chips: [],
    };
  }
  return { answer: t.list(active.map((x) => x.name).join(', ') || '—'), chips: [] };
}

export async function qbuddyAnswer({ question, queues, lang = 'en', windows = {} }) {
  const local = () => localQbuddy({ question, queues, lang, windows });
  if (!aiConfigured()) return fb(await local());
  try {
    const data = await tryJson({
      system: P.QBuddy.system,
      prompt: P.QBuddy.build({ queues, windows, question, lang }),
      temperature: 0.4,
    });
    if (!data.answer) throw new Error('missing answer');
    return ok({ answer: String(data.answer), chips: Array.isArray(data.chips) ? data.chips.slice(0, 3).map(String) : [] });
  } catch (e) {
    return fb(await local(), e.message);
  }
}

/* ── 2. Document checklist ─────────────────────────────────────────────── */

const TIP_RULES = [
  [/receipt|challan|fee|फीस|पावती/i, 'Verify the payment shows "Success" online before leaving home.'],
  [/id|card|पहचान|ओळख/i, 'Carry the original plus one photocopy; digital ID may not be accepted.'],
  [/photo|फोटो/i, 'Bring 2 recent passport-size photos; mobile photos are usually rejected.'],
  [/form|फॉर्म|अरज/i, 'Fill every field and sign beforehand — counters do not provide pens/time.'],
  [/marksheet|गुणपत्रक/i, 'Original + photocopy; keep the roll number handy for quick lookup.'],
  [/book|पुस्तक/i, 'Check the due date in the library app; clear fines before coming.'],
  [/letter|पत्र/i, 'Bring the signed original; an email printout alone may not count.'],
];

function localChecklist(queue) {
  const items = (queue.requiredDocs.length ? queue.requiredDocs : ['College ID card']).map((name) => ({
    name,
    tip: (TIP_RULES.find(([re]) => re.test(name)) || [null, 'Carry the original + one photocopy.'])[1],
    mandatory: true,
  }));
  items.push({ name: 'Photocopy set', tip: 'One photocopy of everything — the counter keeps copies.', mandatory: false });
  return { items };
}

export async function checklistFor(queue, lang = 'en') {
  const local = () => localChecklist(queue);
  if (!aiConfigured()) return fb(local());
  try {
    const data = await tryJson({ system: P.Checklist.system, prompt: P.Checklist.build({ queue, lang }) });
    if (!Array.isArray(data.items) || !data.items.length) throw new Error('bad items');
    return ok({ items: data.items.slice(0, 10).map((i) => ({ name: String(i.name), tip: String(i.tip || ''), mandatory: i.mandatory !== false })) });
  } catch (e) {
    return fb(local(), e.message);
  }
}

/* ── 3. NL queue creation (admin) ──────────────────────────────────────── */

export function localParseQueue(text) {
  const s = String(text).toLowerCase();
  const out = { name: '', department: null, counters: null, maxSlots: null, date: null, from: null, to: null, docs: [], confidence: 0.3 };
  const counters = s.match(/(\d+)\s*(counter|counters|काउंटर)/);
  if (counters) out.counters = Math.max(1, Math.min(10, Number(counters[1])));
  const slots = s.match(/(\d+)\s*(slot|slots|student|students|people)/);
  if (slots) out.maxSlots = Math.max(10, Math.min(999, Number(slots[1])));
  // times: "10 to 1", "9:30-13:00", "10am to 1pm"
  const time = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (time) {
    const to24 = (h, m, ap) => {
      h = Number(h) % 24;
      m = Number(m || 0);
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      return h * 60 + m;
    };
    let fromMin = to24(time[1], time[2], time[3]);
    let toMin = to24(time[4], time[5], time[6] || time[3]);
    if (toMin <= fromMin && !time[6] && !time[3]) toMin += 12 * 60; // "10 to 1" → 10:00–13:00
    out.from = minutesToHHmm(fromMin);
    out.to = minutesToHHmm(Math.max(toMin, fromMin + 60));
  }
  if (/\btomorrow|कल|उद्या/.test(s)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    out.date = dateStrOf(d.getTime()); // local calendar date (never UTC-shifted)
  } else if (/\btoday|आज/.test(s)) {
    out.date = todayStr();
  }
  const dept = DEPARTMENTS.find((d) => new RegExp(`\\b${d}\\b`, 'i').test(s));
  if (dept) out.department = dept;
  const types = [
    [/exam\s*form|परीक्षा फॉर्म/i, 'Exam Form Submission'],
    [/fee|फीस/i, 'Fees Payment'],
    [/bonafide|certificate|बोनाफाइड|प्रमाणपत्र/i, 'Bonafide & Certificates'],
    [/library|पुस्तकालय|ग्रंथालय/i, 'Library Desk'],
    [/admission|प्रवेश/i, 'Admissions Helpdesk'],
    [/lab|किट|kit/i, 'Lab Kit Collection'],
    [/canteen|जेवण|भोजन/i, 'Canteen Tokens'],
  ];
  for (const [re, name] of types) {
    if (re.test(s)) {
      out.name = out.year ? `${name} (${out.year})` : name;
      break;
    }
  }
  const year = s.match(/(\d)(?:st|nd|rd|th)?\s*(?:year|वर्ष)/);
  if (year && out.name) out.name = `${out.name} — Year ${year[1]}`;
  if (!out.name) {
    const words = String(text).split(/[,.]/)[0].trim();
    out.name = words.slice(0, 40) || 'New Queue';
  }
  if (out.counters && out.maxSlots && out.from) out.confidence = 0.8;
  return out;
}

export async function parseQueueFromText(text) {
  const local = () => localParseQueue(text);
  if (!aiConfigured()) return fb(local());
  try {
    const data = await tryJson({ system: P.ParseQueue.system, prompt: P.ParseQueue.build({ text, today: todayStr() }), temperature: 0.2 });
    const base = localParseQueue(text); // fill gaps with local parse
    const merged = { ...base };
    for (const k of ['name', 'department', 'counters', 'maxSlots', 'date', 'from', 'to', 'docs', 'confidence']) {
      const v = data[k];
      if (v != null && !(Array.isArray(v) && !v.length)) merged[k] = v;
    }
    if (!DEPARTMENTS.includes(merged.department)) merged.department = null;
    if (merged.from && !/^\d{2}:\d{2}$/.test(merged.from)) merged.from = null;
    if (merged.to && !/^\d{2}:\d{2}$/.test(merged.to)) merged.to = null;
    return ok(merged);
  } catch (e) {
    return fb(local(), e.message);
  }
}

/* ── 4. Admin AI insights ──────────────────────────────────────────────── */

function localInsights(agg) {
  const recs = [];
  const peak = agg.peakHour ? `${agg.peakHour}:00` : 'midday';
  if (agg.busiestQueue) recs.push(`Open an extra counter at ${agg.busiestQueue.name} around ${peak}.`);
  if (agg.noShowRate > 8) recs.push(`No-show rate is ${agg.noShowRate}% — tighten the grace timer to 60s and enable QR check-in reminders.`);
  else recs.push('Keep current no-show handling; grace timers are working well.');
  if (agg.avgRating && agg.avgRating < 3.5) recs.push(`Feedback averaged ${agg.avgRating}/5 — review top theme "${agg.topTheme || 'general'}" with counter staff.`);
  else recs.push('Announce low-crowd windows on the notice board to flatten peaks further.');
  return {
    summary: `Last 7 days: ${agg.tokens} tokens completed across ${agg.queueCount} queues. Average wait ${agg.avgWaitMin} min, peak load at ${peak}${agg.busiestQueue ? ` (mostly ${agg.busiestQueue.name})` : ''}. No-show rate ${agg.noShowRate}%. Prediction accuracy ${agg.predictionAccuracy ?? '—'}%.`,
    recommendations: recs.slice(0, 3),
  };
}

export async function adminInsights(aggregates, lang = 'en') {
  const local = () => localInsights(aggregates);
  if (!aiConfigured()) return fb(local());
  try {
    const data = await tryJson({ system: P.Insights.system, prompt: P.Insights.build({ aggregates, lang }), temperature: 0.5 });
    if (!data.summary || !Array.isArray(data.recommendations)) throw new Error('bad schema');
    return ok({ summary: String(data.summary), recommendations: data.recommendations.slice(0, 3).map(String) });
  } catch (e) {
    return fb(local(), e.message);
  }
}

/* ── 5. Feedback sentiment refinement ──────────────────────────────────── */

export async function refineSentiment(items) {
  if (!aiConfigured() || !items.length) return null;
  try {
    const data = await tryJson({ system: P.Sentiment.system, prompt: P.Sentiment.build({ items }), temperature: 0.1 });
    if (!Array.isArray(data.items)) throw new Error('bad schema');
    const valid = ['positive', 'neutral', 'negative'];
    return data.items
      .filter((i) => valid.includes(i.sentiment))
      .map((i) => ({ id: String(i.id), sentiment: i.sentiment, theme: String(i.theme || 'general') }));
  } catch {
    return null;
  }
}

/* ── 6. Announcement writer ────────────────────────────────────────────── */

export async function writeAnnouncement(text, lang = 'en') {
  const local = () => ({ en: String(text), hi: String(text), mr: String(text) });
  if (!aiConfigured() || !text?.trim()) return fb(local());
  try {
    const data = await tryJson({ system: P.Announcement.system, prompt: P.Announcement.build({ text, lang }), temperature: 0.5 });
    if (!data.en || !data.hi || !data.mr) throw new Error('bad schema');
    return ok({ en: String(data.en).slice(0, 300), hi: String(data.hi).slice(0, 300), mr: String(data.mr).slice(0, 300) });
  } catch (e) {
    return fb(local(), e.message);
  }
}

export { aiConfigured, aiMode };

/**
 * CSV REPORT EXPORTS — tokens report, users roster, sustainability summary.
 */
import { storage } from '../storage';
import { downloadCsv } from '../../utils/csv';
import { TOKEN_STATUS } from '../../utils/constants';
import { fmtDateTime } from '../../utils/format';
import { computeTokenImpact } from '../green/greenEngine';
import { log as audit } from '../queue/auditService';

export async function exportTokensCsv(actor, days = 30) {
  const since = Date.now() - days * 86400000;
  const tokens = (await storage.getAll('tokens')).filter((t) => (t.issuedAt || 0) >= since);
  const rows = tokens
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .map((t) => ({
      code: t.code,
      queue: t.queueName,
      department: t.department,
      status: t.status,
      priority: t.priority,
      issued: fmtDateTime(t.issuedAt),
      called: fmtDateTime(t.calledAt),
      completed: fmtDateTime(t.completedAt),
      wait_min: t.waitSeconds != null ? Math.round(t.waitSeconds / 60) : '',
      service_min: t.serviceSeconds != null ? Math.round(t.serviceSeconds / 60) : '',
      joined_remote: t.joinedRemote ? 'yes' : 'no',
    }));
  downloadCsv(`qmate-tokens-${days}d.csv`, rows);
  await audit(actor, 'report.exportTokens', 'report', 'tokens', { days, rows: rows.length });
}

export async function exportUsersCsv(actor) {
  const users = await storage.getAll('users');
  const rows = users.map((u) => ({
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department,
    year: u.year,
    status: u.status,
    greenScore: u.greenScore || 0,
    joined: fmtDateTime(u.createdAt),
  }));
  downloadCsv('qmate-users.csv', rows);
  await audit(actor, 'report.exportUsers', 'report', 'users', { rows: rows.length });
}

export async function exportGreenCsv(actor, days = 30) {
  const since = Date.now() - days * 86400000;
  const tokens = (await storage.getAll('tokens')).filter(
    (t) => t.status === TOKEN_STATUS.COMPLETED && (t.completedAt || 0) >= since
  );
  const rows = tokens.map((t) => {
    const imp = computeTokenImpact(t);
    return {
      token: t.code,
      queue: t.queueName,
      completed: fmtDateTime(t.completedAt),
      sheets_saved: imp.sheets,
      co2_saved_g: imp.co2g,
      minutes_saved: imp.minutesSaved,
      value_inr: imp.inrValue,
      green_points: imp.points,
    };
  });
  downloadCsv(`qmate-green-report-${days}d.csv`, rows);
  await audit(actor, 'report.exportGreen', 'report', 'green', { days, rows: rows.length });
}

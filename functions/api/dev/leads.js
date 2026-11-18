// GET /api/dev/leads — enquiry search and spam check for the developer console
//   ?q=      text to look for in the name, email, phone, city, message or IP address
//   ?spam=1  only show enquiries that look like spam (checks the newest 2,000)
// Deleting happens through POST /api/dev/action (action "delete_leads").
import { jsonResponse } from '../../../lib/db.js';
import { authorizeDev } from '../../../lib/dev.js';
import { spamReasons, repeatSets } from '../../../lib/leadtools.js';
import { rowNetwork } from '../../../lib/devtools.js';
import { infoFromJson, deviceAddresses } from '../../../lib/deviceinfo.js';

const MAX_RESULTS = 200;
const SPAM_SCAN = 2000;
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function onRequestGet({ request, env }) {
  const { denied } = await authorizeDev(request, env);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const q = (params.get('q') || '').trim().slice(0, 100);
  const spamOnly = params.get('spam') === '1';

  const where = [];
  const binds = [];
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\' OR ip LIKE ? ESCAPE '\\' OR isp LIKE ? ESCAPE '\\')");
    binds.push(like, like, like, like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows, repeats, total] = await Promise.all([
      env.DB
        .prepare(`
          SELECT id, kind, inquiry_type AS inquiryType, name, email, phone, city, message,
                 handled, stage, ip, ip_place AS ipPlace, isp, asn, device, duplicate_of AS duplicateOf, device_type AS deviceType, device_info AS deviceInfo, updated_by AS updatedBy, updated_at AS updatedAt, created_at AS createdAt
          FROM leads ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ?
        `)
        .bind(...binds, spamOnly ? SPAM_SCAN : MAX_RESULTS + 1)
        .all(),
      repeatSets(env.DB),
      env.DB.prepare('SELECT COUNT(*) AS n FROM leads').first(),
    ]);

    let list = (rows?.results || []).map((r) => {
      const info = infoFromJson(r.deviceInfo);
      const addr = info ? deviceAddresses(info) : { long: null, short: null };
      // The device's other address (the one the site did not see), when the browser reported it
      const otherIp = addr.long && addr.long.source === 'reported' ? { kind: 'long', ip: addr.long.ip }
        : addr.short && addr.short.source === 'reported' ? { kind: 'short', ip: addr.short.ip } : null;
      return {
      id: Number(r.id),
      kind: r.kind,
      inquiryType: r.inquiryType,
      name: r.name,
      email: r.email,
      phone: r.phone,
      city: r.city,
      message: String(r.message || '').slice(0, 500),
      messageCut: String(r.message || '').length > 500,
      handled: Boolean(r.handled),
      stage: r.stage || 'new',
      createdAt: r.createdAt,
      ip: r.ip || '',
      ipPlace: r.ipPlace || '',
      network: rowNetwork(r.asn, r.isp),
      device: r.device || '',
      duplicateOf: Number(r.duplicateOf || 0),
      deviceType: r.deviceType || '',
      updatedBy: r.updatedBy || '',
      updatedAt: r.updatedAt || '',
      hasInfo: Boolean(info),
      otherIp,
      flags: spamReasons({ ...r, webdriver: info?.reported?.webdriver === true }, repeats),
    };
    });
    if (spamOnly) list = list.filter((l) => l.flags.length);
    const more = list.length > MAX_RESULTS;

    return jsonResponse({
      ok: true,
      total: Number(total?.n || 0),
      leads: list.slice(0, MAX_RESULTS),
      more,
      spamChecked: spamOnly ? Math.min(SPAM_SCAN, (rows?.results || []).length) : null,
    });
  } catch (err) {
    console.error('Developer lead search failed:', err);
    return jsonResponse({ error: 'Database read error.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}

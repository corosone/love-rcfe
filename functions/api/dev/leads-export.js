// GET /api/dev/leads-export — downloads every enquiry as a spreadsheet file (CSV) that opens in
// Excel, Numbers or Google Sheets. Developer session required; each download is logged.
import { jsonResponse } from '../../../lib/db.js';
import { authorizeDev, devAudit } from '../../../lib/dev.js';
import { leadsToCsv } from '../../../lib/leadtools.js';

const MAX_ROWS = 50000;

export async function onRequestGet({ request, env }) {
  const { denied } = await authorizeDev(request, env);
  if (denied) return denied;

  try {
    const res = await env.DB
      .prepare(`
        SELECT id, created_at, kind, inquiry_type, name, email, phone, city, message,
               preferred_date, preferred_time, stage, handled, notes, source, ip, ip_place,
               isp, first_response_at, handled_at, duplicate_of, device, device_type
        FROM leads ORDER BY created_at DESC, id DESC LIMIT ?
      `)
      .bind(MAX_ROWS)
      .all();
    const rows = res?.results || [];
    await devAudit(env, request, 'export_leads', `${rows.length} enquiries`);

    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return new Response(leadsToCsv(rows), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="love-rcfe-enquiries-${date}.csv"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (err) {
    console.error('Lead export failed:', err);
    return jsonResponse({ error: 'Database read error.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}

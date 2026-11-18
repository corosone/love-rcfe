// GET  /api/dev/backup — downloads a full backup file (developer session required)
// POST /api/dev/backup — restores enquiries from a backup file, a few at a time:
//                        body { "leads": [ ...up to 25 enquiries from the file... ] }
//                        Only adds enquiries that are missing; never changes or deletes any.
import { jsonResponse, readJsonBody } from '../../../lib/db.js';
import { authorizeDev, devAudit } from '../../../lib/dev.js';
import { buildBackup, restoreLeads, noteBackupDownloaded, RESTORE_BATCH } from '../../../lib/backup.js';

export async function onRequestGet({ request, env }) {
  const { denied } = await authorizeDev(request, env);
  if (denied) return denied;

  try {
    const backup = await buildBackup(env.DB, new URL(request.url).origin);
    await devAudit(env, request, 'backup_download', `${backup.counts.leads} enquiries`);
    // For the Monday summary's backup reminder. Never stops the download if it fails.
    await noteBackupDownloaded(env.DB).catch((err) => console.warn('Could not note the backup time:', err?.message));
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    return new Response(JSON.stringify(backup, null, 1), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="love-rcfe-backup-${date}.json"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (err) {
    console.error('Backup failed:', err);
    return jsonResponse({ error: 'Database read error.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const { denied } = await authorizeDev(request, env);
  if (denied) return denied;

  // 25 enquiries of up to ~9,000 characters each, with room for non-English text
  const parsed = await readJsonBody(request, 600 * 1024);
  if (!parsed.ok) return parsed.response;
  const rows = parsed.data?.leads;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > RESTORE_BATCH) {
    return jsonResponse({ error: `Send between 1 and ${RESTORE_BATCH} enquiries at a time.` }, 400);
  }

  try {
    const result = await restoreLeads(env.DB, rows);
    if (result.added > 0) await devAudit(env, request, 'restore_leads', `added ${result.added}`);
    return jsonResponse({ ok: true, ...result });
  } catch (err) {
    console.error('Restore failed:', err);
    return jsonResponse({ error: 'Database write error.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
}

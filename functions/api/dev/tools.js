// GET /api/dev/tools?tool=<name> — the developer console's Tools tab (developer session required).
//   followup                     enquiries waiting more than a day, and reply times
//   duplicates                   enquiries that look like the same person writing twice
//   journey&id=<enquiry>         what an enquirer looked at before writing in
//   lead-device&id=<enquiry>     the full device report for one enquiry (as in the sign-in email)
//   ip&ip=<address>              everything about one address, its owner and a VPN check
//   licence&q=<text>[&closed=1]  search California's licensed care homes
//   licence-detail&number=<n>    inspection and complaint history for one home
//   holiday                      the holiday switch's current setting
//   deleted                      Recently Deleted: enquiries deleted in the last 30 days
// Changes (mark duplicate, holiday switch, blocking) go through POST /api/dev/action.
import { jsonResponse } from '../../../lib/db.js';
import { authorizeDev, devAudit } from '../../../lib/dev.js';
import { followUp, findDuplicates, journey, ipReport, leadDevice } from '../../../lib/devtools.js';
import { searchFacilities, facilityDetail, STATE_SEARCH_PAGE } from '../../../lib/licence.js';
import { getHoliday, pacificToday } from '../../../lib/settings.js';
import { listDeletedLeads } from '../../../lib/deletedleads.js';

export async function onRequestGet({ request, env }) {
  const { denied } = await authorizeDev(request, env);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const tool = params.get('tool') || '';
  const reply = (r) => jsonResponse(r, r && r.ok === false ? (r.status || 400) : 200);
  try {
    switch (tool) {
      case 'followup':
        return reply(await followUp(env.DB));
      case 'duplicates':
        return reply(await findDuplicates(env.DB));
      case 'journey': {
        const id = Number(params.get('id'));
        if (!Number.isInteger(id) || id <= 0) return jsonResponse({ error: 'Unknown enquiry.' }, 400);
        return reply(await journey(env.DB, id));
      }
      case 'lead-device': {
        const id = Number(params.get('id'));
        if (!Number.isInteger(id) || id <= 0) return jsonResponse({ error: 'Unknown enquiry.' }, 400);
        return reply(await leadDevice(env.DB, id));
      }
      case 'ip': {
        const r = await ipReport(env.DB, params.get('ip') || '');
        if (r.ok) await devAudit(env, request, 'ip_lookup', r.ip);
        return reply(r);
      }
      case 'licence':
        return reply({ ...(await searchFacilities(params.get('q') || '', { includeClosed: params.get('closed') === '1' })), searchPage: STATE_SEARCH_PAGE });
      case 'licence-detail':
        return reply(await facilityDetail(params.get('number') || ''));
      case 'deleted':
        return jsonResponse({ ok: true, ...(await listDeletedLeads(env.DB)) });
      case 'holiday':
        return jsonResponse({ ok: true, holiday: await getHoliday(env, { fresh: true }), today: pacificToday() });
      default:
        return jsonResponse({ error: 'Unknown tool.' }, 400);
    }
  } catch (err) {
    console.error(`Developer tool ${tool} failed:`, err);
    return jsonResponse({ error: 'That tool could not finish. Please try again.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}

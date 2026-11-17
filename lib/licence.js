// Care-home licence lookup for the developer console (Tools tab).
//
// Two free public sources from the State of California, no account or key needed:
//   1. The licensed-facility list on the state's open data portal (data.chhs.ca.gov), searched
//      with its read-only query service: name, licensee, address, capacity and licence status
//      of every Residential Care Facility for the Elderly (RCFE).
//   2. The Department of Social Services' care-facility search (www.ccld.dss.ca.gov), which the
//      state's own search page uses: inspection visits, complaints and citations for one home.
// If either moves or is down, the console says so and links to the state's own search page.

import { USER_AGENT } from './netinfo.js';

const DATA_BASE = 'https://data.chhs.ca.gov/api/3/action';
// The RCFE list. If the state republishes it under a new number, it is found again through the
// data.ca.gov catalogue (see findResourceId).
const DEFAULT_RESOURCE = '744d1583-f9eb-45b6-b0f8-b9a9dab936a6';
const CATALOGUE = 'https://data.ca.gov/api/3/action/package_show?id=community-care-licensing-facilities';
const DETAIL_BASE = 'https://www.ccld.dss.ca.gov/transparencyapi/api/FacilityDetail/';
export const STATE_SEARCH_PAGE = 'https://www.ccld.dss.ca.gov/carefacilitysearch/';
export const facilityPage = (number) => `${STATE_SEARCH_PAGE}FacDetail/${number}`;

let resourceId = DEFAULT_RESOURCE;
let resourceCheckedAt = 0;
const detailCache = new Map();

async function fetchJson(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Looks up the RCFE list's current number in the data.ca.gov catalogue (at most once a day).
async function findResourceId() {
  if (Date.now() - resourceCheckedAt < 24 * 60 * 60 * 1000) return resourceId;
  resourceCheckedAt = Date.now();
  try {
    const d = await fetchJson(CATALOGUE);
    const res = (d?.result?.resources || []).find((r) => /elderly/i.test(r?.name || ''));
    const m = /\/resource\/([0-9a-f-]{36})\//.exec(res?.url || '');
    if (m) resourceId = m[1];
  } catch (err) {
    console.warn('Could not refresh the RCFE list number:', err?.message);
  }
  return resourceId;
}

// Licence numbers are 9 digits; the open-data list drops the leading zero.
export const padNumber = (n) => String(n ?? '').replace(/\D/g, '').padStart(9, '0').slice(-9);

const plain = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const sqlText = (s) => s.replace(/'/g, "''");

// Turns what was typed into a safe query. Returns { sql } or { error }.
export function buildSearchSql(rawQuery, { includeClosed = false, table = DEFAULT_RESOURCE } = {}) {
  const q = plain(rawQuery, 60);
  if (q.length < 2) return { error: 'Type at least 2 letters or numbers.' };
  const where = [];
  const digits = q.replace(/[\s-]/g, '');
  if (/^\d{6,9}$/.test(digits)) {
    where.push(`facility_number = ${Number(digits)}`);
  } else if (/^\d{5}$/.test(digits)) {
    where.push(`CAST(facility_zip AS TEXT) LIKE '${digits}%'`);
  } else {
    // Letters (any language), digits, spaces and & ' . , # - only; everything else is dropped.
    const words = q.replace(/[^\p{L}\p{N}&'.,# -]/gu, ' ').split(/\s+/).map((w) => w.replace(/^[.,'-]+|[.,'-]+$/g, '')).filter((w) => w.length >= 2).slice(0, 5);
    if (!words.length) return { error: 'Type a care home name, licensee, city, ZIP code or licence number.' };
    for (const w of words) {
      const like = `'%${sqlText(w)}%'`;
      where.push(`(facility_name ILIKE ${like} OR licensee ILIKE ${like} OR facility_city ILIKE ${like} OR facility_address ILIKE ${like})`);
    }
  }
  if (!includeClosed) where.push("facility_status <> 'CLOSED'");
  const sql = `SELECT facility_number, facility_name, licensee, facility_administrator, facility_telephone_number, facility_address, facility_city, facility_zip, county_name, facility_capacity, facility_status, license_first_date, closed_date, facility_type FROM "${table}" WHERE ${where.join(' AND ')} ORDER BY CASE facility_status WHEN 'LICENSED' THEN 0 WHEN 'ON PROBATION' THEN 1 WHEN 'PENDING' THEN 2 ELSE 3 END, facility_name LIMIT 26`;
  return { sql };
}

// Search the state's list. Returns { ok, results, more } or { ok: false, error }.
export async function searchFacilities(rawQuery, { includeClosed = false } = {}) {
  const table = await findResourceId();
  const built = buildSearchSql(rawQuery, { includeClosed, table });
  if (built.error) return { ok: false, status: 400, error: built.error };
  let d;
  try {
    d = await fetchJson(`${DATA_BASE}/datastore_search_sql?sql=${encodeURIComponent(built.sql)}`);
  } catch (err) {
    console.warn('RCFE search failed:', err?.message);
    return { ok: false, status: 502, error: 'The state\'s care-home list could not be reached. Try again in a minute, or use the state\'s own search page.', searchPage: STATE_SEARCH_PAGE };
  }
  if (!d?.success || !Array.isArray(d?.result?.records)) {
    resourceCheckedAt = 0; // the list may have moved: look it up again next time
    return { ok: false, status: 502, error: 'The state\'s care-home list answered in an unexpected way. Try again later, or use the state\'s own search page.', searchPage: STATE_SEARCH_PAGE };
  }
  const rows = d.result.records;
  return {
    ok: true,
    results: rows.slice(0, 25).map((r) => ({
      number: padNumber(r.facility_number),
      name: plain(r.facility_name),
      licensee: plain(r.licensee),
      administrator: plain(r.facility_administrator, 80),
      phone: plain(r.facility_telephone_number, 30),
      address: plain(r.facility_address),
      city: plain(r.facility_city, 60),
      zip: plain(r.facility_zip, 10),
      county: plain(r.county_name, 40),
      capacity: Number(r.facility_capacity) || null,
      status: plain(r.facility_status, 30),
      type: plain(r.facility_type, 60),
      licensedSince: plain(r.license_first_date, 12),
      closed: plain(r.closed_date, 12),
      page: facilityPage(padNumber(r.facility_number)),
    })),
    more: rows.length > 25,
  };
}

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};

// Inspection and complaint history for one home. Returns { ok, ... } or { ok: false, error }.
export async function facilityDetail(rawNumber) {
  const digits = String(rawNumber ?? '').replace(/\D/g, '');
  if (!/^\d{6,9}$/.test(digits)) return { ok: false, status: 400, error: 'Enter a 9-digit licence number.' };
  const number = padNumber(digits);
  const hit = detailCache.get(number);
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return hit.value;
  let d;
  try {
    d = await fetchJson(DETAIL_BASE + number);
  } catch (err) {
    console.warn('RCFE detail failed:', err?.message);
    return { ok: false, status: 502, error: 'The state\'s inspection records could not be reached. Open the state\'s page for this home instead.', page: facilityPage(number) };
  }
  const f = d?.FacilityDetail;
  if (!f || typeof f !== 'object' || !f.FACILITYNUMBER) {
    return { ok: false, status: 404, error: 'The state has no inspection record for that number.', page: facilityPage(number) };
  }
  const tso = d?.TSO && typeof d.TSO === 'object' ? d.TSO : {};
  const legal = plain(tso.ActionType, 80);
  const value = {
    ok: true,
    number,
    name: plain(f.FACILITYNAME),
    status: plain(f.STATUS, 30),
    capacity: num(f.CAPACITY) || null,
    licensee: plain(f.LICENSEENAME),
    administrator: plain(f.CONTACT, 80),
    phone: plain(f.TELEPHONE, 30),
    address: [plain(f.STREETADDRESS), plain(f.CITY, 60), plain(f.ZIPCODE, 10)].filter(Boolean).join(', '),
    county: plain(f.COUNTY, 40),
    licensedSince: plain(f.LICENSEFIRSTDATE, 12),
    closed: plain(f.DATECLOSED, 12),
    lastVisit: plain(f.LASTVISITDATE, 12),
    visits: { all: num(f.NBRALLVISITS), inspections: num(f.NBRINSPVISITS), complaints: num(f.NBRCMPLTVISITS), other: num(f.NBROTHERVISITS) },
    complaints: {
      total: num(f.CMPCOUNT || f.TOTCMPVISITS),
      substantiated: num(f.TOTSUBALG),
      inconclusive: num(f.TOTINCALG),
      unsubstantiated: num(f.TOTUNSALG),
      unfounded: num(f.TOTUNFALG),
    },
    citations: { typeA: num(f.TOTTYPEA), typeB: num(f.TOTTYPEB) },
    legalAction: legal ? { type: legal, closed: String(tso.CaseClosed).toLowerCase() === 'true' } : null,
    notes: [plain(f.COMMENTS, 600), plain(f.COMMENTS2, 600)].filter(Boolean).join(' '),
    districtOffice: [plain(f.DISTRICTOFFICE, 60), plain(f.DOTELEPHONE, 30)].filter(Boolean).join(', '),
    page: facilityPage(number),
  };
  detailCache.set(number, { at: Date.now(), value });
  if (detailCache.size > 200) detailCache.delete(detailCache.keys().next().value);
  return value;
}

// For tests only.
export function _resetLicenceCaches() {
  resourceId = DEFAULT_RESOURCE;
  resourceCheckedAt = 0;
  detailCache.clear();
}

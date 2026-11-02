import Px from 'px';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';

export const SOURCE_URL = 'https://pxweb.stat.si/SiStatData/Resources/PX/Databases/Data/2974206S.PX';
export const CATALOG_URL = 'https://podatki.gov.si/dataset/surs2974206s';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function parsePcAxis(bytes) {
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 500));
  const encoding = /CODEPAGE="([^"]+)"/.exec(header)?.[1] || 'utf-8';
  // Px.js expects DATA at the beginning of a line and whitespace between values.
  const text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n');
  if (!/^DATA=/m.test(text)) throw new Error('Vir ni veljavna datoteka PCAXIS.');
  const px = new Px(text);
  const dimensions = ['LETO', 'NAMEN UPORABE INTERNETA', 'SPOL', 'IZOBRAZBA'];
  if (JSON.stringify(px.variables()) !== JSON.stringify(dimensions)) throw new Error('Struktura tabele SURS se je spremenila.');
  const expected = dimensions.reduce((n, v) => n * px.values(v).length, 1);
  if (px.data.length !== expected) throw new Error('Število podatkov ne ustreza dimenzijam PCAXIS.');
  if (px.keyword('MATRIX') !== '2974206S' || px.keyword('UNITS') !== 'število') throw new Error('Nepričakovana tabela ali merska enota.');
  const activityCodes = px.codes(1);
  const gaming = activityCodes.indexOf('STAT1063');
  const internet = activityCodes.indexOf('STAT25');
  if (gaming < 0 || internet < 0) throw new Error('V viru manjka zahtevani kazalnik.');
  const options = axis => px.values(axis).map((label, index) => ({ code: px.codes(axis)[index], label }));
  const sexes = options(2);
  const educations = options(3);
  if (sexes.length !== 3 || educations.length !== 4 || sexes[0].code !== '1' || educations[0].code !== '1') {
    throw new Error('Skupine v tabeli SURS so se spremenile.');
  }
  const years = px.values(0);
  const cell = (y, activity, s, e) => {
    const raw = String(px.datum([y, activity, s, e])).trim();
    const key = [px.codes(0)[y], activityCodes[activity], sexes[s].code, educations[e].code].join(',');
    const note = px.metadata.DATANOTECELL?.[key]?.trim() || null;
    return { value: /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : null, raw, note };
  };
  const rows = [];
  years.forEach((year, y) => sexes.forEach((sex, s) => educations.forEach((education, e) => {
    const count = cell(y, gaming, s, e);
    const base = cell(y, internet, s, e);
    if (count.value !== null && base.value !== null && count.value > base.value) throw new Error('Število igralcev presega osnovo za delež.');
    rows.push({ year, sex: sex.code, education: education.code, count: count.value,
      internetUsers: base.value, percent: count.value !== null && base.value > 0 ? count.value / base.value * 100 : null,
      raw: count.raw, note: count.note, baseRaw: base.raw, baseNote: base.note });
  })));
  if (!rows.some(row => row.count !== null)) throw new Error('Vir ne vsebuje podatkov o igranju.');
  return {
    source: { title: px.keyword('DESCRIPTION'), publisher: px.keyword('SOURCE'), url: SOURCE_URL,
      catalogUrl: CATALOG_URL, license: 'CC BY 4.0', matrix: '2974206S', encoding,
      updated: px.keyword('LAST-UPDATED'), sha256: sha256(bytes), cells: expected },
    indicator: { code: 'STAT1063', label: px.values(1)[gaming], denominator: px.values(1)[internet] },
    years, sexes, educations, rows,
  };
}

export function createDataSource({ fetchImpl = globalThis.fetch, cacheDir = new URL('./data/', import.meta.url) } = {}) {
  let pending;
  const pxPath = new URL('2974206S.px', cacheDir);
  const metaPath = new URL('source.json', cacheDir);
  async function load() {
    const checkedAt = new Date().toISOString();
    let liveError;
    try {
      const response = await fetchImpl(SOURCE_URL, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/octet-stream' } });
      if (!response.ok) throw new Error(`SURS HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 5_000_000) throw new Error('Prevelika datoteka PCAXIS.');
      const result = parsePcAxis(bytes);
      const fetchedAt = new Date().toISOString();
      let cacheSaved = true;
      try {
        await mkdir(cacheDir, { recursive: true });
        await writeFile(new URL('2974206S.px.tmp', cacheDir), bytes);
        await rename(new URL('2974206S.px.tmp', cacheDir), pxPath);
        await writeFile(metaPath, JSON.stringify({ fetchedAt, sha256: result.source.sha256 }, null, 2) + '\n');
      } catch { cacheSaved = false; }
      return { ...result, retrieval: { mode: 'live', checkedAt, fetchedAt, cacheSaved } };
    } catch (error) { liveError = error; }
    try {
      const bytes = new Uint8Array(await readFile(pxPath));
      const result = parsePcAxis(bytes);
      let fetchedAt = (await stat(pxPath)).mtime.toISOString();
      try {
        const meta = JSON.parse(await readFile(metaPath, 'utf8'));
        if (meta.sha256 === result.source.sha256) fetchedAt = meta.fetchedAt;
      } catch { /* File time is used when provenance is unavailable. */ }
      return { ...result, retrieval: { mode: 'cache', checkedAt, fetchedAt, reason: liveError.message } };
    } catch {
      throw new Error('Podatkov SURS ni mogoče pridobiti in veljavna lokalna kopija ni na voljo. Poskusite znova ob vzpostavljeni internetni povezavi.', { cause: liveError });
    }
  }
  return { load() {
    // Only overlapping requests share a download; each subsequent page load checks SURS again.
    pending ||= load().finally(() => { pending = null; });
    return pending;
  } };
}

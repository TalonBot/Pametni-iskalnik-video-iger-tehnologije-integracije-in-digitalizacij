import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parsePcAxis, createDataSource } from './data.js';
import { buildView, selectRow } from './model.js';

const bytes = new Uint8Array(await readFile(new URL('./data/2974206S.px', import.meta.url)));
const dataset = parsePcAxis(bytes);
async function temporaryCache(t) {
  const path = await mkdtemp(join(tmpdir(), 'naloga3-test-'));
  t.after(async () => {
    const target = resolve(path);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes('naloga3-test-'));
    await rm(target, { recursive: true, force: true });
  });
  return pathToFileURL(path + sep);
}

test('izvirna PCAXIS: windows-1250, slovenske dimenzije in znane celice SURS', () => {
  assert.equal(dataset.source.encoding, 'windows-1250');
  assert.equal(dataset.source.matrix, '2974206S');
  assert.equal(dataset.source.cells, 11808);
  assert.equal(dataset.rows.length, 144);
  assert.equal(dataset.sexes[2].label, 'Ženske');
  assert.equal(selectRow(dataset, '2024', '1', '1').count, 370301);
  assert.equal(selectRow(dataset, '2024', '2', '1').count, 207006);
  assert.equal(selectRow(dataset, '2024', '3', '1').count, 163295);
});

test('manjkajoče vrednosti niso ničle; oznaka M se ohrani pri pravi večdimenzionalni celici', () => {
  const missing = selectRow(dataset, '2025', '1', '1');
  assert.equal(missing.count, null);
  assert.equal(missing.percent, null);
  assert.equal(missing.raw, '..');
  assert.equal(selectRow(dataset, '2020', '2', '2').note, 'M');
  assert.equal(selectRow(dataset, '2020', '2', '2').count, 44717);
});

test('delež uporablja lastno osnovo skupine; primerjave ne prištejejo skupnih vrednosti', () => {
  const row = selectRow(dataset, '2024', '2', '3');
  assert.equal(row.percent, row.count / row.internetUsers * 100);
  const view = buildView(dataset, { year: '2024', sex: '2', education: '3', metric: 'percent' });
  assert.equal(view.current, row);
  assert.equal(view.bySex.length, 2);
  assert.equal(view.byEducation.length, 3);
  assert.equal(view.bySex[0].row.education, '3');
  assert.equal(view.byEducation[0].row.sex, '2');
  assert.equal(view.previousYear, '2022');
  assert.equal(view.delta, row.percent - selectRow(dataset, '2022', '2', '3').percent);
  assert.equal(view.table.length, dataset.years.length);
  assert.ok(!view.trend.some(group => group.label === '2025'));
  const missing = buildView(dataset, { year: '2025', sex: '1', education: '1', metric: 'count' });
  assert.equal(missing.delta, null);
  assert.ok(missing.bySex.every(group => group.row.count === null));
});

test('neveljaven ali odrezan vir se zavrne', () => {
  assert.throws(() => parsePcAxis(new TextEncoder().encode('<html>Error</html>')));
  assert.throws(() => parsePcAxis(bytes.slice(0, bytes.length - 2000)));
});

test('vsak zaporeden obisk pridobi nov vir; ob izpadu ohrani zadnji veljavni PX', async t => {
  const cacheDir = await temporaryCache(t);
  let calls = 0;
  const source = createDataSource({ cacheDir, fetchImpl: async () => {
    calls++;
    if (calls > 2) throw new Error('simuliran izpad');
    return new Response(bytes);
  } });
  assert.equal((await source.load()).retrieval.mode, 'live');
  const live = await source.load();
  assert.equal(live.retrieval.mode, 'live');
  assert.equal(calls, 2);
  const fallback = await source.load();
  assert.equal(fallback.retrieval.mode, 'cache');
  assert.equal(fallback.retrieval.fetchedAt, live.retrieval.fetchedAt);
  assert.deepEqual(fallback.rows, live.rows);
  assert.equal(fallback.source.sha256, live.source.sha256);
  const invalid = createDataSource({ cacheDir, fetchImpl: async () => new Response('<html>bad upstream</html>') });
  assert.equal((await invalid.load()).retrieval.mode, 'cache');
  assert.deepEqual(new Uint8Array(await readFile(new URL('2974206S.px', cacheDir))), bytes);
});

test('sočasni obiski delijo prenos; brez omrežja in kopije vrne jasno napako', async t => {
  const cacheDir = await temporaryCache(t);
  let calls = 0;
  const source = createDataSource({ cacheDir, fetchImpl: async () => { calls++; return new Response(bytes); } });
  const [first, second] = await Promise.all([source.load(), source.load()]);
  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  const empty = await temporaryCache(t);
  const unavailable = createDataSource({ cacheDir: empty, fetchImpl: async () => new Response('', { status: 503 }) });
  await assert.rejects(unavailable.load(), /lokalna kopija ni na voljo/);
});

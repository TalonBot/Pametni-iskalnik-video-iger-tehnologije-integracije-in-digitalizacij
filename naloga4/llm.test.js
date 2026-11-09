import test from 'node:test';
import assert from 'node:assert/strict';
import { LlmOdgovor, PriporociloIgre } from './model.js';
import { buildPrompt, recommend, selectCandidates, validateInput } from './llm.js';

const input = { zelje: 'Rad bi sproščeno igro z raziskovanjem.', platforma: 'Windows', proracun: 25, zvrst: '', nacin: 'sam' };
const game = (appId, fields = {}) => ({ appId, name: `Igra ${appId}`, price: 10, currency: 'EUR', platforms: ['Windows'], genres: ['Adventure'], tags: [], features: ['Single-player'], reviewCount: 100, ...fields });
const snapshot = { parsedAt: '2026-11-09T12:00:00Z', games: [game('10'), game('20', { price: 100 }), game('30', { platforms: ['Linux'] }), game('40', { price: 0, currency: null }), game('50', { price: null })] };
const answer = { povzetek: 'Izbrana igra za raziskovanje.', priporocila: [{ appId: '10', razlog: 'Ustreza tvoji želji po raziskovanju.', opozorilo: 'Dolžina igranja ni potrjena.' }] };
const provider = (text, finishReason = 'STOP') => async () => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }));

test('JSON se deserializira v zahtevana razreda in zavrne neveljavne tipe ter podvojitve', () => {
  const result = LlmOdgovor.fromJSON(JSON.stringify(answer));
  assert.ok(result instanceof LlmOdgovor);
  assert.ok(result.priporocila[0] instanceof PriporociloIgre);
  for (const data of [{ ...answer, povzetek: 7 }, { ...answer, priporocila: [] }, { ...answer, priporocila: [...answer.priporocila, ...answer.priporocila] }, { ...answer, priporocila: [{ ...answer.priporocila[0], razlog: '' }] }]) assert.throws(() => new LlmOdgovor(data));
  assert.throws(() => LlmOdgovor.fromJSON('ni JSON'));
});

test('kandidati upoštevajo proračun, platformo, zvrst in brezplačne igre', () => {
  assert.deepEqual(selectCandidates(snapshot.games, input).map(game => game.appId), ['10', '40']);
  assert.deepEqual(selectCandidates(snapshot.games, { ...input, proracun: 0 }).map(game => game.appId), ['40']);
  assert.equal(selectCandidates(snapshot.games, { ...input, zvrst: 'RPG' }).length, 0);
});

test('prompt se spreminja z uporabnikovim vnosom in vključuje podatke kataloga', () => {
  const a = buildPrompt(input, [game('10')], snapshot.parsedAt);
  const b = buildPrompt({ ...input, zelje: 'Želim tekmovalno igro za prijatelje.', proracun: 0 }, [game('40')], snapshot.parsedAt);
  assert.notEqual(a, b);
  assert.ok(a.includes(input.zelje));
  assert.ok(a.includes('Igra 10'));
  assert.ok(b.includes('"proracun":0'));
});

test('neveljavni vnosi se zavrnejo pred klicem ponudnika', async () => {
  for (const value of [null, [], { ...input, zelje: 'kratko' }, { ...input, platforma: 'PS5' }, { ...input, proracun: '25' }, { ...input, proracun: -1 }, { ...input, nacin: 'neveljavno' }]) assert.throws(() => validateInput(value));
  let called = false;
  await assert.rejects(recommend(snapshot, { ...input, zelje: '' }, { apiKey: 'test', fetchImpl: async () => { called = true; } }), { status: 400 });
  assert.equal(called, false);
});

test('zahteva ponudniku vsebuje dinamični prompt in JSON shemo; podatki igre so iz kataloga', async () => {
  let sent;
  const result = await recommend(snapshot, input, { apiKey: 'test-secret', fetchImpl: async (url, options) => {
    sent = JSON.parse(options.body);
    assert.match(url, /generativelanguage\.googleapis\.com/);
    assert.equal(options.headers['x-goog-api-key'], 'test-secret');
    return provider(JSON.stringify(answer))();
  } });
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(sent.generationConfig.responseJsonSchema.required, ['povzetek', 'priporocila']);
  assert.ok(sent.contents[0].parts[0].text.includes(input.zelje));
  assert.ok(result.odgovor instanceof LlmOdgovor);
  assert.equal(result.igre[0].name, 'Igra 10');
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});

test('zavrne izmišljene ID-je, nepravilni JSON, blokirane in odrezane odgovore', async () => {
  const unknown = { ...answer, priporocila: [{ ...answer.priporocila[0], appId: '999' }] };
  for (const fetchImpl of [provider(JSON.stringify(unknown)), provider('```json\n{}\n```'), provider('{}'), provider(JSON.stringify(answer), 'MAX_TOKENS'), provider(JSON.stringify(answer), 'SAFETY')]) await assert.rejects(recommend(snapshot, input, { apiKey: 'test', fetchImpl }), { status: 502 });
});

test('obravnava manjkajoči ključ, prazne kandidate, HTTP napake in časovno omejitev', async () => {
  await assert.rejects(recommend(snapshot, input, { apiKey: '' }), { status: 503 });
  await assert.rejects(recommend(snapshot, { ...input, zvrst: 'RPG' }, { apiKey: 'test' }), { status: 422 });
  for (const status of [403, 429, 500]) await assert.rejects(recommend(snapshot, input, { apiKey: 'test', fetchImpl: async () => new Response('{}', { status }) }), { status: status === 403 ? 503 : status === 429 ? 429 : 502 });
  await assert.rejects(recommend(snapshot, input, { apiKey: 'test', fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } }), /45 sekundah/);
});

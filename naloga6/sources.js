import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { createDataSource } from '../naloga3/data.js';

export const HOUR = 3600000;
export const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const CHEAPSHARK_URL = 'https://www.cheapshark.com/api/1.0/';
const agent = 'PLAY-UniversityProject/1.0 (+https://github.com/TalonBot/Pametni-iskalnik-video-iger-tehnologije-integracije-in-digitalizacij)';

export function parseEcb(xml) {
  if (XMLValidator.validate(xml) !== true) throw new Error('ECB ni vrnil veljavnega XML.');
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true }).parse(xml);
  const day = parsed.Envelope?.Cube?.Cube;
  const usd = (Array.isArray(day?.Cube) ? day.Cube : [day?.Cube]).find(item => item?.currency === 'USD');
  const rate = Number(usd?.rate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day?.time || '') || !Number.isFinite(rate) || rate <= 0) throw new Error('V ECB manjka veljaven tečaj USD.');
  return { date: day.time, usdPerEur: rate, sourceUrl: ECB_URL };
}
export function parseDeals(rows, appId) {
  if (!Array.isArray(rows)) throw new Error('CheapShark ni vrnil seznama ponudb.');
  return rows.filter(row => String(row.steamAppID) === String(appId)).map(row => {
    const price = Number(row.salePrice), normalPrice = Number(row.normalPrice);
    if (!row.dealID || !row.title || !String(row.salePrice).trim() || !Number.isFinite(price) || price < 0 || !Number.isFinite(normalPrice) || normalPrice < 0) throw new Error('CheapShark je vrnil neveljavno ceno.');
    return { title: row.title, storeId: String(row.storeID), dealId: row.dealID, priceUsd: price, normalPriceUsd: normalPrice,
      // dealID je v odgovoru že URL kodiran; preprečimo dvojno kodiranje.
      url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(decodeURIComponent(row.dealID))}` };
  }).sort((a, b) => a.priceUsd - b.priceUsd);
}

export function createSources({ store, fetchImpl = globalThis.fetch, sursSource = createDataSource() }) {
  const pending = new Map(), failures = new Map();
  async function cached(key, source, ttl, loader) {
    const old = store.cached(key);
    const wrap = (row, stale = false, error = null) => ({ ...row.data, retrieval: { fetchedAt: row.fetchedAt, expiresAt: new Date(row.expiresAt).toISOString(), stale, error } });
    if (old && old.expiresAt > Date.now()) return wrap(old);
    if (pending.has(key)) return pending.get(key);
    const recent = failures.get(key);
    if (recent && Date.now() - recent.time < 60000) {
      if (old) return wrap(old, true, recent.error);
      throw new Error(recent.error);
    }
    const promise = (async () => {
      store.mark(source);
      try {
        const data = await loader();
        store.putCache(key, data, ttl); store.mark(source, null, true); failures.delete(key);
        return wrap(store.cached(key));
      } catch (error) {
        failures.set(key, { time: Date.now(), error: error.message }); store.mark(source, error.message);
        if (old) return wrap(old, true, error.message);
        throw error;
      } finally { pending.delete(key); }
    })();
    pending.set(key, promise);
    return promise;
  }
  async function response(url) {
    const r = await fetchImpl(url, { headers: { 'User-Agent': agent }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Zunanji vir je vrnil HTTP ${r.status}.`);
    return r;
  }
  const rates = () => cached('ecb', 'ecb', 24 * HOUR, async () => parseEcb(await (await response(ECB_URL)).text()));
  const stores = () => cached('stores', 'cheapshark', 24 * HOUR, async () => {
    const rows = await (await response(CHEAPSHARK_URL + 'stores')).json();
    if (!Array.isArray(rows) || !rows.length || !rows.every(row => row.storeID && row.storeName)) throw new Error('Neveljaven seznam trgovin.');
    return { stores: Object.fromEntries(rows.map(row => [String(row.storeID), row.storeName])) };
  });
  const deals = id => cached(`deals:${id}`, 'cheapshark', HOUR, async () => ({ deals: parseDeals(await (await response(`${CHEAPSHARK_URL}deals?steamAppID=${id}&pageSize=30&sortBy=Price`)).json(), id) }));
  const surs = () => cached('surs', 'surs', 24 * HOUR, async () => {
    const data = await sursSource.load();
    if (data.retrieval.mode !== 'live') throw new Error('SURS trenutno ni dosegljiv.');
    return data;
  });
  async function comparison(id) {
    const [offers, fx, shops] = await Promise.allSettled([deals(id), rates(), stores()]);
    if (offers.status === 'rejected') throw offers.reason;
    const exchange = fx.status === 'fulfilled' ? fx.value : null;
    const names = shops.status === 'fulfilled' ? shops.value.stores : {};
    return { ...offers.value, exchange, exchangeError: fx.status === 'rejected' ? fx.reason.message : null,
      storesStale: shops.status === 'rejected' || shops.value.retrieval.stale,
      deals: offers.value.deals.map(deal => ({ ...deal, store: names[deal.storeId] || `Trgovina ${deal.storeId}`,
        priceEur: exchange ? Math.round(deal.priceUsd / exchange.usdPerEur * 100) / 100 : null })) };
  }
  return { rates, stores, deals, surs, comparison };
}

import { scrapeGames } from '../parser/steam.js';
import { scrapeFreeGames } from '../parser/free.js';
import { importCatalog } from './catalog.js';
import { HOUR } from './sources.js';

export function createRefresh({ store, sources, scrape = scrapeGames, scrapeFree = scrapeFreeGames, importData = importCatalog }) {
  const directory = new URL('../data/refresh/', import.meta.url);
  let pending = null;
  let state = { running: false, message: '', error: null };
  const status = () => ({ ...state });
  function steam(force = false) {
    if (pending) return pending;
    const catalog = store.catalog();
    const last = store.source('steam');
    if (!force && catalog && Date.now() - Date.parse(catalog.parsedAt) < 24 * HOUR) return Promise.resolve(status());
    if (!force && last?.last_attempt && Date.now() - Date.parse(last.last_attempt) < 15 * 60000) return Promise.resolve(status());
    state = { running: true, message: 'Osvežujem Steamov seznam in cene …', error: null }; store.mark('steam');
    const progress = message => { state.message = message; };
    pending = (async () => {
      try {
        await scrapeFree({ directory, details: false, onProgress: progress });
        await scrape({ directory, details: false, fresh: true, onProgress: progress });
        const catalog = await importData({ directory });
        store.mark('steam', null, true);
        state = { running: false, message: `Osveženih ${catalog.count} iger.`, error: null };
      } catch (error) {
        store.mark('steam', error.message);
        state = { running: false, message: 'Osvežitev ni uspela. Zadnja uspešna zbirka je ohranjena.', error: error.message };
      } finally { pending = null; }
      return status();
    })();
    return pending;
  }
  const warm = () => { void steam(); void Promise.allSettled([sources.rates(), sources.stores(), sources.surs()]); };
  const timer = setInterval(warm, 5 * 60000); timer.unref();
  return { steam, status, warm, close: () => clearInterval(timer) };
}

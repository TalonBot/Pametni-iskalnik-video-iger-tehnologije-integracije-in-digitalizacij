import { readGames as readFiles } from '../parser/steam.js';
import { getStore } from './store.js';

export async function readGames() {
  const store = getStore();
  const existing = store.catalog();
  if (existing) return existing;
  store.saveCatalog(await readFiles());
  return store.catalog();
}
export async function importCatalog(options) {
  const catalog = await readFiles(options);
  getStore().saveCatalog(catalog);
  return catalog;
}

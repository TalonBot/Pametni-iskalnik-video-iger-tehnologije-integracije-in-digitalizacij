import { importCatalog } from './catalog.js';
import { getStore } from './store.js';

try {
  const catalog = await importCatalog();
  console.log(`V SQLite je uvoženih ${catalog.count} iger iz lokalnih datotek parserja.`);
} finally { getStore().close(); }

import { scrapeFreeGames } from './free.js';

try {
  const result = await scrapeFreeGames({ onProgress: console.log });
  console.log(`Shranjeno ${result.games.length} brezplačnih iger v data/free-games.json.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }

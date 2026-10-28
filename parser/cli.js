import { scrapeFreeGames } from './free.js';
import { scrapeGames } from './steam.js';

try {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^--pages=(all|[1-9]\d*)$/.test(arg) && !['--no-details', '--fresh'].includes(arg))) {
    throw new Error('Uporaba: npm run parse -- [--pages=all|N] [--no-details] [--fresh]');
  }
  const pageArgument = args.find(arg => arg.startsWith('--pages='))?.split('=')[1] || 'all';
  const pages = pageArgument === 'all' ? null : Number(pageArgument);
  await scrapeFreeGames({ details: !args.includes('--no-details'), onProgress: console.log });
  const result = await scrapeGames({ pages, details: !args.includes('--no-details'), fresh: args.includes('--fresh'), onProgress: console.log });
  console.log(`Shranjeno ${result.count} iger v data/games.json. Opozorila: ${result.warnings.length}.`);
  console.log(`Vse strani seznama: ${result.report.listingComplete ? 'DA' : 'NE (omejen zajem)'}. Poročilo: data/parser-report.json`);
} catch (error) {
  console.error('Razčlenjevanje ni uspelo:', error.message);
  process.exitCode = 1;
}

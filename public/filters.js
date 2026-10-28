export const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
const freePhrase = /\b(?:free to play|free|f2p|brezplacne igre|brezplacno|brezplacne|brezplacni|zastonj)\b/g;

// A genre/tag is not proof that the current offer costs nothing.
export const isFree = game => game.price === 0;
export const euroPrice = game => isFree(game) ? 0 : game.currency === 'EUR' && Number.isFinite(game.price) ? game.price : null;
const nullLast = (a, b, direction = 1) => a == null ? (b == null ? 0 : 1) : b == null ? -1 : (a - b) * direction;
const date = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const freeGenre = value => normalize(value) === 'free to play';

export function filterGames(source, { query = '', genre = '', platform = '', payment = '', maxPrice = '', highRating = false, sort = 'popular' } = {}) {
  const normalized = normalize(query);
  const wantsFree = freePhrase.test(normalized);
  freePhrase.lastIndex = 0;
  const words = (wantsFree ? normalized.replace(freePhrase, ' ') : normalized).split(/\s+/).filter(Boolean);
  const limit = String(maxPrice).trim() === '' ? null : Number(maxPrice);
  const games = source.filter(game => {
    const text = normalize([game.name, game.description, ...(game.genres || []), ...(game.tags || []), ...(game.features || []), ...(game.developers || []), ...(game.publishers || [])].join(' '));
    const cost = euroPrice(game);
    return (!wantsFree || isFree(game)) && words.every(word => text.includes(word)) &&
      (!genre || (freeGenre(genre) ? isFree(game) : (game.genres || []).includes(genre))) &&
      (!platform || (game.platforms || []).includes(platform)) &&
      (!payment || (payment === 'free' ? isFree(game) : cost !== null && cost > 0)) &&
      (limit === null || Number.isFinite(limit) && limit >= 0 && cost !== null && cost <= limit) &&
      (!highRating || game.rating != null && game.rating >= 90);
  });
  const comparators = {
    popular: (a, b) => nullLast(a.reviewCount, b.reviewCount, -1),
    'price-asc': (a, b) => nullLast(euroPrice(a), euroPrice(b)),
    'price-desc': (a, b) => nullLast(euroPrice(a), euroPrice(b), -1),
    discount: (a, b) => (b.discount || 0) - (a.discount || 0),
    rating: (a, b) => nullLast(a.rating, b.rating, -1) || nullLast(a.reviewCount, b.reviewCount, -1),
    newest: (a, b) => nullLast(date(a.releaseDate), date(b.releaseDate), -1),
    name: (a, b) => a.name.localeCompare(b.name, 'sl'),
  };
  return games.sort((a, b) => (comparators[sort] || comparators.popular)(a, b) || a.name.localeCompare(b.name, 'sl'));
}

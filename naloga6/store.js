import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export class Store {
  constructor(filename = fileURLToPath(new URL('../data/play.sqlite', import.meta.url))) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS games(app_id TEXT PRIMARY KEY, name TEXT NOT NULL, payload TEXT NOT NULL, fetched_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS games_name ON games(name);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS library(app_id TEXT PRIMARY KEY REFERENCES games(app_id), state TEXT NOT NULL CHECK(state IN ('zelim','igram','koncano')), note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, last_attempt TEXT, last_success TEXT, error TEXT);
      PRAGMA user_version=1;`);
  }
  close() { this.db.close(); }
  catalog() {
    const row = this.db.prepare('SELECT payload FROM metadata WHERE key=?').get('catalog');
    if (!row) return null;
    const games = this.db.prepare('SELECT payload FROM games WHERE active=1 ORDER BY rowid').all().map(row => JSON.parse(row.payload));
    return { ...JSON.parse(row.payload), games, count: games.length };
  }
  game(id) {
    const row = this.db.prepare('SELECT payload FROM games WHERE app_id=?').get(String(id));
    return row ? JSON.parse(row.payload) : null;
  }
  saveCatalog(catalog) {
    if (!Array.isArray(catalog.games) || !catalog.games.length) throw new Error('Prazen katalog ne sme prepisati podatkov.');
    const { games, ...meta } = catalog;
    const upsert = this.db.prepare('INSERT INTO games(app_id,name,payload,fetched_at,active) VALUES(?,?,?,?,1) ON CONFLICT(app_id) DO UPDATE SET name=excluded.name,payload=excluded.payload,fetched_at=excluded.fetched_at,active=1');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('UPDATE games SET active=0');
      for (const incoming of games) {
        const previous = this.game(incoming.appId);
        // Osvežitev seznama posodobi cene; že zbrani opisi in oznake ostanejo.
        const game = { ...incoming };
        game.priceFetchedAt = catalog.parsedAt;
        if (previous && incoming.detailStatus !== 'ok') {
          for (const key of ['description','genres','about','developers','publishers','tags','features','languages','screenshots','requirements','metacritic','detailStatus','detailParsedAt']) {
            if (previous[key] != null) game[key] = previous[key];
          }
        }
        upsert.run(String(game.appId), game.name, JSON.stringify(game), catalog.parsedAt);
      }
      this.db.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run('catalog', JSON.stringify(meta));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  saved() {
    return this.db.prepare('SELECT g.payload,l.state,l.note,l.updated_at FROM library l JOIN games g USING(app_id) ORDER BY l.updated_at DESC').all()
      .map(row => ({ game: JSON.parse(row.payload), state: row.state, note: row.note, updatedAt: row.updated_at }));
  }
  save(id, state, note) {
    this.db.prepare('INSERT INTO library VALUES(?,?,?,?) ON CONFLICT(app_id) DO UPDATE SET state=excluded.state,note=excluded.note,updated_at=excluded.updated_at')
      .run(String(id), state, note, new Date().toISOString());
  }
  remove(id) { return this.db.prepare('DELETE FROM library WHERE app_id=?').run(String(id)).changes; }
  cached(key) {
    const row = this.db.prepare('SELECT * FROM cache WHERE key=?').get(key);
    return row ? { data: JSON.parse(row.payload), fetchedAt: row.fetched_at, expiresAt: row.expires_at } : null;
  }
  putCache(key, data, ttl, now = Date.now()) {
    this.db.prepare('INSERT OR REPLACE INTO cache VALUES(?,?,?,?)').run(key, JSON.stringify(data), new Date(now).toISOString(), now + ttl);
  }
  source(id) { return this.db.prepare('SELECT * FROM sources WHERE id=?').get(id) || null; }
  mark(id, error = null, success = false) {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO sources VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      last_attempt=excluded.last_attempt,last_success=COALESCE(excluded.last_success,sources.last_success),error=excluded.error`)
      .run(id, now, success ? now : null, error);
  }
}

let singleton;
export function getStore() {
  if (!singleton) {
    mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
    singleton = new Store();
  }
  return singleton;
}

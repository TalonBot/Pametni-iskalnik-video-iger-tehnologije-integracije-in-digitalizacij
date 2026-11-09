// Razreda predstavljata pogodbo JSON odgovora ponudnika LLM.
function text(value, field, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError(`Neveljavno polje ${field}.`);
  return value.trim();
}

export class PriporociloIgre {
  constructor(data) {
    if (!data || typeof data !== 'object') throw new TypeError('Neveljavno priporočilo.');
    this.appId = text(data.appId, 'appId', 20);
    if (!/^\d+$/.test(this.appId)) throw new TypeError('Neveljaven Steam ID.');
    this.razlog = text(data.razlog, 'razlog', 1200);
    this.opozorilo = text(data.opozorilo, 'opozorilo', 800);
  }
}

export class LlmOdgovor {
  constructor(data) {
    if (!data || typeof data !== 'object') throw new TypeError('Neveljaven odgovor LLM.');
    this.povzetek = text(data.povzetek, 'povzetek');
    if (!Array.isArray(data.priporocila) || data.priporocila.length < 1 || data.priporocila.length > 3) throw new TypeError('Pričakovanih je od 1 do 3 priporočil.');
    this.priporocila = data.priporocila.map(item => new PriporociloIgre(item));
    if (new Set(this.priporocila.map(item => item.appId)).size !== this.priporocila.length) throw new TypeError('Priporočila se ne smejo ponavljati.');
  }

  static fromJSON(json) { return new LlmOdgovor(JSON.parse(json)); }
}

export const responseSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    povzetek: { type: 'string', description: 'Kratek povzetek izbire v slovenščini.' },
    priporocila: {
      type: 'array', minItems: 1, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          appId: { type: 'string', description: 'Steam appId iz priloženega seznama kandidatov.' },
          razlog: { type: 'string', description: 'Zakaj igra ustreza konkretnim željam uporabnika, v slovenščini.' },
          opozorilo: { type: 'string', description: 'Omejitev izbire ali negotovost; če je ni, napiši Brez posebnih opozoril.' },
        },
        required: ['appId', 'razlog', 'opozorilo'],
      },
    },
  },
  required: ['povzetek', 'priporocila'],
};

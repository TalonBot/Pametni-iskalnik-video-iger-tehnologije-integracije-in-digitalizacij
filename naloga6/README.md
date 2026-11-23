# Naloga 6 – celovita aplikacija PLAY

**Tema:** pametni iskalnik videoiger. Uporabnik poišče igro, primerja ponudbe trgovin, shrani igro na osebni seznam, spremeni njen status in opombo ali jo odstrani. Na voljo so tudi osebna AI priporočila, pretočno iskanje in statistika igranja v Sloveniji.

## Zagon

Potrebuješ **Node.js 22.14 ali novejši** in npm. V korenu repozitorija:

```sh
npm ci
npm start
```

Odpri **http://127.0.0.1:3000/naloga6/**. Obstoječi katalog je na `/`, AI na `/naloga4/`, statistika SURS na `/naloga3/`, pretakanje na `/naloga5/`. Vse strani so povezane z navigacijo. Na karticah glavnega kataloga je povezava »Primerjaj ponudbe in shrani«.

Za druga spletna vrata v PowerShellu: `$env:PORT = '3016'`, nato `npm start`.

Ob prvem zagonu se **samodejno ustvarijo tabele SQLite** in uvozi priloženi katalog JSON. Za začetni ogled ni treba najprej zagnati parserja. Stara zbirka se prikazuje, dokler se v ozadju ne zaključi svež zajem. Med osveževanjem je v razdelku »Viri in svežina« prikazan napredek.

Steam, CheapShark, SURS in ECB ne potrebujejo API ključa. Za Gemini je potreben `GEMINI_API_KEY` v `.env`, po vzorcu `.env.example`. Ključ ostane na strežniku. Ostale funkcije delujejo tudi brez nastavljenega Gemini ključa. Node 22.14 ob uvozu vgrajenega modula `node:sqlite` izpiše obvestilo, da je modul v tej različici še eksperimentalen.

## Zahteve in izvedba

| Zahteva | Izvedba |
| --- | --- |
| Backend | Node.js HTTP strežnik, JSON API, poslovna logika, odjemalec in strežnik gRPC |
| Frontend | Interaktivni HTML/CSS/JavaScript, odzivna postavitev, skupna navigacija |
| Podatkovna baza | SQLite: katalog, osebni seznam, predpomnilnik in stanje zunanjih virov |
| Vsaj 4 zunanji viri | Steam, SURS, CheapShark, ECB; dodatno Gemini |
| Različne tehnologije vaj | Web scraping, PCAxis, REST/JSON, XML ter gRPC s Protocol Buffers |
| Ažurnost | Samodejni intervali, preverjanje ob obisku in ob zagonu, prenos v ozadju |
| Akcije uporabnika | Iskanje, filtri, primerjava cen, dodajanje, urejanje statusa/opombe, brisanje |
| Smiselna celota | Odkritje igre → ponudbe → osebni seznam → AI pomoč pri naslednji izbiri |

**gRPC je povezava z našo podatkovno storitvijo in ga ne štejemo kot dodaten neodvisen zunanji vir.** Štirje podatkovni viri so zagotovljeni tudi brez štetja LLM. SOAP v tej izvedbi ni uporabljen; vključene so tehnologije dosedanjih nalog in XML. Če bodo prihodnje vaje posebej zahtevale dodatno tehnologijo, se ta doda kot nova integracija.

## Zunanji viri in osveževanje

| Vir | Podatki in tehnologija | Interval |
| --- | --- | --- |
| Steam Store | Imena, cene, popusti, ocene in platforme; HTML web scraping s Cheerio | 24 ur; tudi ročni zagon |
| SURS | Igranje v Sloveniji, dimenzije leto/spol/izobrazba; datoteka PCAxis | 24 ur v skupnem pregledu; stran naloge 3 preveri vir tudi ob vsakem obisku |
| CheapShark | Ponudbe igre v različnih trgovinah; REST/JSON | Za izbrano igro po izteku 1 ure; imena trgovin 24 ur |
| ECB | Referenčni tečaj USD za 1 EUR; XML | 24 ur |
| Gemini | Osebna priporočila na podlagi obrazca in trenutnega kataloga; REST/strukturiran JSON | Ob uporabniški zahtevi |

Strežnik ob zagonu in vsakih pet minut preveri, kateri intervali so potekli. Ob obisku kataloga oziroma pregleda sproži tudi preverjanje Steamove zbirke. Ponudbe CheapShark se pridobivajo samo za izbrano igro, kadar je predpomnilnik pretekel. Ko strežnik ne teče, osveževanje ne poteka; ob naslednjem zagonu se zastareli podatki ponovno preverijo.

Sočasne zahteve za isti vir delijo en prenos. Ob napaki se uspešna kopija v SQLite ohrani; ponudbe in tečaj so v vmesniku jasno označeni kot starejši. Če za vir kopije ni, se pokaže napaka, druge funkcije pa ostanejo uporabne. Ponovni poskus neuspelega Steamovega zajema je omejen na 15 minut; pri ponudbah na eno minuto. Ročna osvežitev kataloga je omejena na en zahtevek na minuto.

### Obseg Steamovega zajema

Osveži se celoten izbrani javni seznam Steamovih ponudb in prva stran do 100 brezplačnih iger. To **ni celoten Steamov katalog**. Ob dnevni osvežitvi se osvežijo podatki seznamov, medtem ko že zbrani opisi, zvrsti in oznake ostanejo ohranjeni. Nove igre lahko zato še nimajo podrobnega opisa ali zvrsti. Za popoln zajem opisov je na voljo obstoječi parser iz naloge 2.

Delovne datoteke dnevnega zajema so v ignorirani mapi `data/refresh/`, zato samodejno osveževanje ne spreminja priloženega začetnega kataloga v Gitu. V podatkovno bazo se rezultat objavi šele po uspešnem koncu zajema. Ob napaki sredi prenosa ostane prejšnja zbirka.

Za ročni popolni zajem z opisi zaženi `npm run parse:free` in `npm run parse`, nato **`npm run db:import`**, da rezultat lokalnih datotek objaviš tudi v SQLite. Ta izrecni uvoz zamenja aktivni katalog s podatki iz datotek parserja in ohrani osebni seznam. Dnevna osvežitev ta uvoz izvede samodejno iz svoje delovne mape.

### Povezovanje ponudb in valut

CheapShark iščemo po natančnem **Steam App ID**, da ne združimo podobno poimenovanih iger. Ponudbe so razvrščene po ceni USD. Povezave uporabljajo CheapSharkovo preusmeritev, kot zahteva njihov API. Opisni `User-Agent` identificira ta projekt.

ECB vrne število USD za 1 EUR, zato velja **cena EUR = cena USD / tečaj USD za EUR**. Za prikaz zaokrožimo na dve decimalki. Pretvorba je informativna: regija, davki in končna cena se lahko razlikujejo. Steamova cena in ponudbe drugih trgovin imajo lahko različna časa pridobitve. Ob nedosegljivem tečaju brez kopije se izvorna cena USD prikaže brez pretvorbe. Referenčni tečaj ne pomeni ponudbe za menjavo valute.

## Arhitektura

```text
Brskalnik: katalog / moj seznam in ponudbe / AI / statistika / tok
                          |
                    Node.js backend
                  /       |        \
           CRUD + SQLite  |    REST/JSON → CheapShark, Gemini
                          |    XML → ECB
                    gRPC odjemalec   PCAxis → SURS
                          |    HTML scraping → Steam
                IgreService / HTTP2 / Protobuf
                          |
                  katalog iz SQLite
```

Iskanje na novi strani dejansko uporablja `PoisciIgre` iz naloge 5. Vsi štirje gRPC klici zdaj berejo aktualni katalog iz SQLite. Tudi glavni katalog in LLM kandidati uporabljajo isti repozitorij podatkov. Obstoječe vaje ostanejo dostopne.

## Baza SQLite

Lokalna datoteka: **`data/play.sqlite`**, spremljevalni datoteki `-wal` in `-shm`. Datoteke baze so izključene iz Gita, da se osebni seznam ne objavi. Baza se samodejno ustvari iz kode; ločen strežnik baze ni potreben.

| Tabela | Namen |
| --- | --- |
| `games` | Primarni ključ Steam App ID, ime, JSON podatki igre, čas zajema in oznaka trenutnega kataloga |
| `library` | Tuji ključ na igro, status `zelim`/`igram`/`koncano`, opomba in čas spremembe |
| `metadata` | Metapodatki trenutnega kataloga in poročilo parserja |
| `cache` | Odgovori CheapShark, ECB in SURS, čas pridobitve ter izteka |
| `sources` | Čas zadnjega poskusa, zadnjega uspeha in zadnja napaka |

Objava kataloga je transakcijska. Igre, ki niso več na seznamu ponudb, postanejo neaktivne; shranjene igre ostanejo na osebnem seznamu. CRUD uporablja parametrizirane SQL poizvedbe in preverjanje statusa, ID-ja, dolžine opombe ter izvora zapisovalnih zahtev. Opombe se pri prikazu HTML ustrezno ubežijo.

Aplikacija je lokalna, namenjena enemu uporabniku. Osebni seznam je skupen brskalnikom, ki dostopajo do istega lokalnega strežnika. Za varnostno kopijo ustavi aplikacijo in kopiraj `data/play.sqlite`.

## Glavne poti

| Pot | Namen |
| --- | --- |
| `GET /naloga6/api/overview` | Obseg kataloga, napredek in stanje virov |
| `GET /naloga6/api/compare?id=374040` | Natančno povezane ponudbe in preračun valut |
| `GET /naloga6/api/library` | Osebni seznam |
| `POST /naloga6/api/library` | Dodaj igro: `{appId, state, note}` |
| `PUT /naloga6/api/library` | Uredi status in opombo |
| `DELETE /naloga6/api/library` | Odstrani igro: `{appId}` |
| `GET /naloga6/api/surs` | Statistika s predpomnilnikom v bazi |
| `POST /naloga6/api/refresh` | Ročna osvežitev kataloga v ozadju |
| `GET /naloga5/api/games` | Spletni prehod do gRPC iskanja |

## Preverjanje in zagovor

```sh
npm test
npm run test:naloga6
```

Testi preverjajo transakcije, ohranitev opisov in osebnega seznama po osvežitvi, obstojnost po ponovnem odprtju baze, parserja zunanjih virov, pravilen tečaj, TTL, združevanje zahtev, izpade virov, samodejno osveževanje in HTTP CRUD. Vključeni so tudi testi vseh prejšnjih vaj.

Predlagan potek zagovora:

1. Zaženi `npm start` in odpri `/naloga6/`.
2. Pokaži »Viri in svežina«: štirje neodvisni podatkovni viri in ločene tehnologije.
3. Poišči igro, uporabi platformo ali zgornjo mejo cene in razloži, da iskanje uporablja gRPC.
4. Klikni »Primerjaj ponudbe«; pokaži izvorne cene USD, trgovine, čas zajema in tečaj ECB.
5. Shrani igro, spremeni status v »Trenutno igram«, dodaj opombo in shrani.
6. Osveži stran ali ponovno zaženi strežnik: seznam ostane. Filtriraj po statusu in nato igro odstrani.
7. Odpri grafični pregled SURS in obrazec za osebna priporočila.
8. Pokaži `store.js` (tabele in transakcija), `sources.js` (REST/XML in TTL) ter `refresh.js` (samodejni intervali).
9. Zaženi teste, ki med drugim simulirajo izpad ponudnikov in preverijo ohranitev zadnje kopije.

## Dokumentacija virov

- [CheapShark API](https://apidocs.cheapshark.com/)
- [ECB referenčni tečaji](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
- [SURS/OPSI: uporabljena tabela](https://podatki.gov.si/dataset/surs2974206s)
- [Steam Store: izbrani seznam](https://store.steampowered.com/search/?specials=1&category1=998&filter=topsellers&cc=si&l=english)
- [gRPC Node.js](https://grpc.io/docs/languages/node/basics/)

Prvotni načrt naloge 1 je predvideval tudi RAWG in osebno Steam knjižnico prek Steam Web API. Končna izvedba uporablja zgornje delujoče integracije; RAWG in prijava s Steam računom nista del te različice.

### Preverjanje z dejanskimi ponudniki

Povzetek je v [preverjanje.json](preverjanje.json). Dne 23. 11. 2026 je samodejni zajem vrnil 2.373 iger; za Portal Knights je CheapShark vrnil osem ponudb in pretvorba je uporabila ECB tečaj z datumom 23. 11. 2026. Potrjena sta tudi gRPC tok in obstojnost podatkov po ponovnem zagonu. Gemini je ob tem preverjanju vrnil HTTP 503 zaradi velikega povpraševanja; aplikacija pokaže napako ponudnika. Štirje neodvisni podatkovni viri delujejo tudi v tem primeru.

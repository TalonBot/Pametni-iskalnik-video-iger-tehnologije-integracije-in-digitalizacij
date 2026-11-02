# Pametni iskalnik video iger

**Avtor:** Tilen Gabor | **Predmet:** Tehnologije integracije in digitalizacij

## Naloga 3 – Odprti podatki

Izvedba je v mapi [`naloga3/`](naloga3/README.md). Zagon: `npm install` in `npm start`, nato odprite **http://127.0.0.1:3000/naloga3/**. Razdelek »Videoigre v številkah« dinamično pridobi PCAXIS iz SURS/OPSI ter prikazuje trend igranja, primerjavi po spolu in izobrazbi, filtre, izračun deležev ter izvoz CSV. Podrobna razlaga vira, izračunov in lokalne kopije je v [navodilih naloge 3](naloga3/README.md). Testi: `npm run test:naloga3` oziroma `npm test` za celoten projekt.

## Naloga 2 - Parser: lokacija datotek

Datoteke za **nalogo 2 (razčlenjevalnik spletnih vsebin)** so v tem repozitoriju:

| Datoteka oziroma mapa | Namen |
| --- | --- |
| [`parser/steam.js`](parser/steam.js) | **Glavna izvorna koda parserja**: pridobivanje Steamovega HTML, razčlenjevanje, prehod čez vse strani in shranjevanje v JSON. |
| [`parser/cli.js`](parser/cli.js) | Zagon parserja iz terminala z ukazom `npm run parse`. |
| [`parser/reparse.js`](parser/reparse.js) | Ponovno razčlenjevanje lokalno shranjenega HTML z ukazom `npm run parse:offline`. |
| [`package.json`](package.json) in [`package-lock.json`](package-lock.json) | Odvisnosti in ukazi za namestitev ter zagon; namestitev z `npm install`. |
| [`data/games.json`](data/games.json) | Shranjeni rezultat dejanskega zajema: podatki o 2.096 igrah. |
| [`data/parser-report.json`](data/parser-report.json) | Dokaz zajema: obdelane strani, število iger in pregled zbranih ter manjkajočih polj. |
| [`tests/parser.test.js`](tests/parser.test.js) | Samodejni testi parserja; zagon z `npm test`. |
| [`server.js`](server.js) in [`public/`](public/) | Lokalna spletna aplikacija za prikaz, iskanje, filtriranje in sortiranje rezultatov; zagon z `npm start`. |

Če je za nalogo zahtevana izvorna koda razčlenjevalnika, je glavna datoteka **`parser/steam.js`**. Za samostojen zagon priložite še `parser/cli.js`, `package.json`, `package-lock.json` in ta README z ohranjeno strukturo map. Mape `node_modules/` ne prilagajte.

Izvorni HTML dokumenti v `data/raw/` in vmesni napredek `data/checkpoint.json` nastanejo pri zajemu in ostanejo lokalni (izključeni so iz Gita). Za ponovitev brez interneta najprej izvedite spletni zajem, da se ti podatki ustvarijo tudi na drugem računalniku.

## Povzetek

Razvil bom aplikacijo, ki bo uporabniku pomagala najti igro za igranje. Omogočil bom iskanje po imenu, filtre in sortiranje, uporabnik pa bo lahko primerjal tudi cene. V aplikacijo bom povezal Steam račun, da bom priporocila lahko prilagodil uporabnikovi knjižnici, času igranja in prejsnjim izbiram.

## Panoga in uporabljene storitve

Projekt bom delal na podrocju videoiger. Povezal bom tri storitve:

- **RAWG** bom uporabil za podatke o igrah, kot so ime, opis, zvrst, platforme, datum izdaje, ocena in slika.
- **CheapShark** bom uporabil za iskanje cen in popustov v spletnih trgovinah.
- **Steam Web API** bom uporabil za pridobitev seznama iger in časa igranja iz uporabnikove Steam knjiznice. Te podatke bom uporabil pri priporocilih.

## Uporabnost ideje

Uporabniku ne bo treba posebej iskati podatkov o igri na eni strani in cen na drugi. V aplikaciji, ki jo bom razvil, bo lahko našel igre, primerjal ponudbe in dobil priporočila glede na igre, ki jih že ima ali jih veliko igra. Algoritem bom zasnoval tako, da bo upošteval prejšnje izbire, ocene in zvrsti priljubljenih iger.

Podobne funkcije že obstajajo v različnih storitvah. Moja ideja je, da bom priporočila, običajno iskanje in primerjavo cen združil na enem mestu.

## Storitve in dokumentacija

### RAWG

Z RAWG bom iskal igre in pridobival njihove opise, zvrsti, platforme, datum izdaje, ocene in slike.

- Dokumentacija: [RAWG API docs](https://api.rawg.io/docs/)
- V zahtevo bom poslal iskalno besedilo, želene filtre in API kljuc. Za podroben opis bom uporabil RAWG ID igre.
- Odgovore in slike RAWG bom v aplikaciji navedel kot vir.

### CheapShark

S CheapShark bom poiskal aktualne ponudbe za računalniške igre v različnih spletnih trgovinah.

- Dokumentacija: [CheapShark API docs](https://apidocs.cheapshark.com/)
- V zahtevo bom poslal naslov igre ali Steam App ID.
- Prejel bom ime igre, trgovino, trenutno in običajno ceno, popust ter povezavo do ponudbe. API ključa ne potrebujem, cene pa so v ameriških dolarjih.

### Steam Web API

Steam bom povezal, da bom priporocila lahko pripravil na podlagi uporabnikove knjižnice in časa igranja.

- Dokumentacija: [Steam Web API, IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService)
- V zahtevi bom uporabil Steam ID in API kljuc.
- Prejel bom seznam iger, njihove ID-je in cas igranja. Podatki o igrah morajo biti vidni v nastavitvah zasebnosti Steam profila.

## Podatki, ki jih bom prenašal

Vse tri storitve bom klical prek API-jev. Zahteve in odgovori bodo v obliki **JSON**. Ne bom prenašal Wordovih ali drugih dokumentov, ampak podatke o igrah, uporabnikovih izbirah in ponudbah.

- **RAWG:** poslal bom iskalno besedilo, filtre in ključ API. Odgovor lahko vsebuje `id`, `name`, `description`, `released`, `rating`, `genres`, `platforms` in `background_image`. ID in ocena sta številska, ime in opis sta besedilo, zvrsti in platforme so seznami, datum je datum, slika pa spletni naslov.
- **CheapShark:** poslal bom naslov igre ali Steam App ID. Odgovor lahko vsebuje `title`, `steamAppID`, `storeID`, `dealID`, `salePrice`, `normalPrice`, `savings` in povezavo do ponudbe. ID-je bom obravnaval kot nize, cene in popuste, ki pridejo kot besedilo, pa bom pretvoril v števila za primerjavo.
- **Steam:** poslal bom Steam ID in API ključ. V JSON odgovoru bom uporabil ID igre (`appid`), ime igre in čas igranja (`playtime_forever`).
- **Moja aplikacija:** zabeležil bom igre, ki jih uporabnik označi ali oceni, ter njegove iskalne nize in filtre. Te podatke bom uporabil za prilagojena priporočila.

## Akterji

- **Jaz** bom razvil aplikacijo in algoritem za priporočanje iger.
- **Uporabnik** bo iskal igre, nastavljal filtre, povezal Steam račun ter odpiral prikazane ponudbe.
- **RAWG** mi bo vrnil podatke o igrah.
- **CheapShark** mi bo vrnil podatke o cenah in ponudbah.
- **Steam Web API** mi bo vrnil podatke o uporabnikovi knjižnici in času igranja, če bodo ti podatki vidni.

## Kako bom povezal storitve

```text
Uporabnik izbere filtre in poveže Steam račun
                         |
                         v
                Moja aplikacija
                 /      |      \
                v       v       v
             RAWG    Steam API  CheapShark
          podatki o   igre in    cene in
             igrah    čas igranja ponudbe
                \       |       /
                 v      v      v
            Združim podatke in pripravim
                iskanje ter priporočila
                         |
                         v
        Uporabnik vidi igre in njihove cene
```

## Viri

- [RAWG API dokumentacija](https://api.rawg.io/docs/)
- [CheapShark API dokumentacija](https://apidocs.cheapshark.com/)
- [Steam Web API, IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService)
- ChatGPT (OpenAI), pomoč pri oblikovanju besedila načrta, 12. 10. 2026.

---

## Naloga: razčlenjevalnik spletnih vsebin (lokalna izvedba)

V tej fazi je implementirana lokalna aplikacija **PLAY / Pametni iskalnik video iger**. Razčlenjevalnik v Node.js prenese **HTML spletnih strani Steam Store** in s knjižnico Cheerio izlušči podatke. Ne uporablja Steam Web API-ja, RAWG ali CheapShark API-ja. Zato je ta izvedba dejanski razčlenjevalnik spletne vsebine, preostale integracije iz načrta zgoraj pa še niso implementirane.

### Zagon aplikacije

Potrebujete **Node.js 22 ali novejši** in npm. V terminalu odprite to mapo projekta:

```powershell
npm install
npm run parse
npm start
```

Odprite **http://127.0.0.1:3000**. Strežnik posluša samo na lokalnem vmesniku. Ustavite ga s `Ctrl+C`. Če vrata 3000 uporablja drug program, v PowerShellu pred zagonom določite `$env:PORT = 3001`.

Zbirka `data/games.json` že vsebuje dejansko zajete podatke. Za ogled obstoječe zbirke je dovolj `npm install` in `npm start`; za nov zajem potrebujete internet. Spletne slike in izbirni Google Fonts se nalagajo s spleta, ob nedostopnosti pisav pa se uporabijo sistemske pisave.

Parser lahko zaženete samostojno:

```powershell
npm run parse                          # vse strani seznama in podrobnosti vseh najdenih iger
npm run parse -- --pages=1             # ena stran, manj zahtev
npm run parse -- --pages=4             # izrecno omejen poskusni zajem štirih strani
npm run parse -- --fresh               # nov zajem od začetka namesto nadaljevanja
npm run parse -- --pages=1 --no-details # samo osnovni podatki iz seznama
npm run parse:offline                  # ponovi razčlenjevanje shranjenih HTML brez interneta
npm test                              # samodejni testi parserja
```

Isti zajem zaženete z gumbom **Osveži podatke** na spletni strani. Med zajemom se prikazuje napredek tudi pri ukaznem zagonu parserja. Datoteka parser.lock preprečuje sočasna zagona. Prekinjeni zajem se ob ponovnem enakem ukazu nadaljuje iz checkpoint.json; dokončan zajem se pri naslednjem zagonu začne znova. Gumb je omejen na en nov zagon na minuto.

### Vir in način zbiranja

Vir seznama: [Steamove ponudbe](https://store.steampowered.com/search/?specials=1&category1=998&filter=topsellers&cc=si&l=english).

Parametri izberejo igre v ponudbi, vrstni red najbolje prodajanih izdelkov, regijo Slovenija in angleški jezik podatkov. Parser privzeto sledi paginaciji do zadnje strani brez omejitve števila strani. Zahteva do 100 rezultatov na stran in nato obišče vsako enolično stran igre za razširjene podatke. Ob izvedbi je imel seznam približno 2.110 vrstic; število se spreminja. Paketi, ki nimajo povezave /app/, so prešteti med preskočene vrstice. Nabor ni celoten katalog Steama. Vrstni red »Priljubljenosti« v aplikaciji pomeni število uporabniških ocen, padajoče.

Zahteve imajo časovno omejitev 25 sekund, med obiski je kratek premor. Podrobnosti obdelujejo trije delavci; začasne HTTP napake se ponovijo največ trikrat z naraščajočim premorom. Parser ne uporablja prijave, ne potrjuje starostnih omejitev in ne obide blokad. Podrobnosti nekaterih iger so zato lahko nedostopne. Pri napaki podrobnosti shrani osnovno igro in opozorilo; pri napaki seznama ali praznem rezultatu prekine zajem ter ohrani prejšnji JSON. Po uspešnem branju vseh izbranih strani objavi osnovno zbirko, nato jo med pridobivanjem podrobnosti posodablja vsakih 25 iger. Polji report.finished in report.detailCounts.pending jasno pokažeta, ali zajem še teče. Vsako zamenjavo JSON izvede atomarno. Če Steam spremeni HTML, je treba prilagoditi selektorje v `parser/steam.js`.

### Podatki v JSON

Datoteka ima metapodatke `schemaVersion`, `source`, `sourceUrl`, `sourcePages`, `country`, `parsedAt` (čas UTC), `count`, `warnings` in seznam `games`.

| Polje igre | Tip | Pomen |
| --- | --- | --- |
| `appId` | niz | Steam App ID, ključ za poznejše povezovanje storitev |
| `name` | niz | naslov igre |
| `description` | niz ali null | kratek opis s podstrani igre |
| `about` | niz ali null | celoten opis igre kot besedilo |
| `developers`, `publishers` | seznama nizov | razvijalci in založniki |
| `tags`, `features` | seznama nizov | oznake skupnosti in funkcije igre |
| `languages` | seznam objektov | jezik, podpora vmesniku, zvoku in podnapisom |
| `requirements` | objekt | sistemske zahteve po platformah |
| `screenshots` | seznam URL | povezave do slik zaslona |
| `metacritic` | število ali null | ocena Metacritic, kadar je prikazana |
| `detailParsedAt` | čas UTC | čas branja podstrani |
| `genres` | seznam nizov | zvrsti s podstrani |
| `platforms` | seznam nizov | Windows, macOS, Linux, kot jih navede seznam |
| `released` | niz | izvirno besedilo datuma izdaje |
| `releaseDate` | datum YYYY-MM-DD ali null | pretvorjen popoln datum za sortiranje |
| `price`, `originalPrice` | število ali null | trenutna in običajna cena |
| `currency` | niz ali null | EUR, kadar je valuta prepoznana v HTML |
| `discount` | število | odstotek popusta |
| `rating` | število ali null | odstotek pozitivnih uporabniških ocen (0–100), ni RAWG ocena |
| `reviewCount` | število ali null | število ocen, navedeno v HTML |
| `reviewSummary` | niz ali null | Steamov besedilni povzetek ocene |
| `image`, `url` | URL ali null | slika in izvirna stran igre |
| `store` | niz | Steam |
| `detailStatus` | niz | ok, unavailable, error ali pending (preskočen zajem podrobnosti) |

Nedostopne vrednosti so `null` oziroma prazni seznami. Spletni prikaz jih označi z — ali pojasnilom; pri sortiranju manjkajoče cene, ocene in datume postavi na konec. Cene so posnetek ob zajemu in se lahko spremenijo. Ocene so tiste, ki jih Steam vrne v HTML, in so lahko odvisne od jezikovnih nastavitev.

### Spletni prikaz

- Črno ozadje, belo besedilo, prilagodljiva mreža kartic.
- Iskanje po naslovu in opisu.
- Filtri po zvrsti, platformi, najvišji ceni in oceni vsaj 90 %.
- Sortiranje po številu ocen, ceni naraščajoče/padajoče, popustu, oceni, datumu izdaje in naslovu.
- Podrobnosti igre ob kliku na naslov ter povezava do izvirne Steamove strani.
- Prikaz števila iger, najnižjih cen, največjega popusta in časa zajema.
- Osveževanje z napredkom, prenos JSON in obravnava praznih rezultatov/napak.

### Struktura izvorne kode

```text
parser/steam.js        prenos HTML, razčlenjevanje, pretvorbe, shranjevanje
parser/cli.js          samostojni ukazni zagon parserja
parser/reparse.js      ponovljiva pretvorba shranjenega HTML brez omrežnih zahtev
server.js              lokalni HTTP strežnik in poti /api/games, /api/refresh, /api/status
public/index.html      struktura spletne strani
public/style.css       odziven črno-bel videz
public/app.js          prikaz, filtri, sortiranje, podrobnosti in osveževanje
data/games.json        dejanski shranjeni rezultat parserja
data/raw/*.html        izvirni HTML vseh seznamov in obiskanih iger (izključen iz Gita)
data/checkpoint.json  napredek za nadaljevanje prekinjenega zajema (izključen iz Gita)
data/parser-report.json poročilo o dejansko zajetih in manjkajočih poljih
tests/parser.test.js   preverjanje pretvorb, manjkajočih podatkov in podvojitev
```

Ni API ključev, računa, podatkovne baze ali obvezne namestitve brskalnika/Puppeteerja. Aplikacija uporablja že strežniško vrnjen HTML. Ta faza še ne vključuje prijave, osebnih priporočil, Steam knjižnice ali primerjave različnih trgovin. Vir podatkov in slik je Steam; vsebina opisov ostaja v jeziku vira.

Izvorna koda, spletni prikaz in rezultat zajema za nalogo 2 so vključeni v ta GitHub repozitorij. Aplikacija se izvaja lokalno; oddaja v učilnico ni bila izvedena.

### Dokaz delovanja in pomen popolnosti

Na strani razprite **Poročilo parserja · dokaz zajema**. Poročilo lahko prenesete tudi prek `/api/report` oziroma preberete `data/parser-report.json`. Vsebuje število obiskanih strani, vrstic vira, enoličnih iger, podvojitev in preskočenih vrstic, stanje podrobnosti in tabelo prisotnih/manjkajočih vrednosti za vsako polje. `listingComplete=true` pomeni, da je parser dosegel konec izbranega seznama; `finished=true` pomeni, da je zaključil tudi zahtevane poskuse podrobnosti. To ne pomeni, da vsaka igra javno objavlja vsako polje. `allDetailsAccessible` ločeno pove, ali so bile vse strani podrobnosti dostopne.

Za preverjanje so v `data/raw/` shranjeni izvorni HTML dokumenti, katerih vsebino lahko primerjate z JSON. Datoteke ostanejo lokalne. Samodejni testi dodatno dokazujejo prehod čez več kot štiri strani, nadaljevanje po prekinitvi, zavrnitev ponovljene strani in pošteno označevanje omejenega zajema.

**Obseg:** vse igre iz izbranega seznama Steamovih ponudb za regijo SI, ne celoten katalog Steam in ne podatki drugih storitev. Seznam se med zajemom spreminja, zato poročilo navede število rezultatov na začetku in koncu, preskočene vrstice in podvojitve. Vrednosti, ki jih vir ne objavi, se ne izmišljajo. Javno nedostopne Steam knjižnice in podatki RAWG/CheapShark ostajajo zunaj tega HTML parserja. Spletni prikaz prikazuje po 60 kartic ter omogoča nalaganje dodatnih, filtri in sortiranje pa delujejo nad celotno lokalno zbirko.

Za demonstracijo po zaključenem zajemu zaženite `npm run parse:offline`: program iz izvirnih HTML ponovno sestavi podatke, poročilo in JSON z nič omrežnimi zahtevami. To zahteva ohranjeno mapo `data/raw/` in zaključen `data/checkpoint.json`; ti lokalni datoteki nista del Git repozitorija. Za samostojen spletni zajem zadostuje izvorna koda in `npm install`.


## Posodobitev filtrov

Iskanje preverja naslov, opis, zvrsti, oznake, funkcije, razvijalce in založnike. Besede se lahko pojavijo v različnem vrstnem redu; velike črke, šumniki in vezaji ne vplivajo na iskanje. Vsi izbrani filtri veljajo hkrati in delujejo nad celotno zbirko, tudi nad še neprikazanimi karticami.

- `free to play`, `free-to-play`, `f2p`, `brezplačno`, `brezplačne igre` in `zastonj` poiščejo igre s potrjeno brezplačno ceno. Dodate lahko še izraz, npr. `f2p moba`.
- Izbira **Brezplačne / Free to Play**, zvrst **Free To Play** in najvišja cena **0 €** izberejo iste brezplačne igre. Plačljivih iger zgolj z oznako Free To Play ne štejejo kot brezplačne.
- Filter **Plačljive igre** izbere igre z znano pozitivno ceno v EUR. Neznane cene so izključene iz cenovnih filtrov in pri razvrščanju ostanejo na koncu.
- Najvišja cena podpira cente. Gumb **Počisti filtre** ponastavi tudi vrsto cene in razvrščanje.

Zbirka ponudb sama ne vsebuje običajnih brezplačnih iger. Dodatek `data/free-games.json` zato vsebuje zajem prve strani Steamovega seznama brezplačnih iger (do 100 vrstic, ne celoten katalog). Zajame le igre, kjer prikazana cena potrjuje brezplačnost; skriti atribut `data-price-final=0` brez vidne cene ni dokaz. Vidna oznaka Free ima prednost pred ceno plačljive nadgradnje v atributu.

```bash
npm run parse:free   # osveži samo dodatek brezplačnih iger
npm start           # združi oba JSON po Steam appId in prikaže spletno aplikacijo
npm test            # testi parserja, filtrov in združevanja zbirk
```

`npm run parse` in gumb **Osveži podatke** osvežita tudi brezplačni dodatek. `npm run parse:offline` ga ponovno sestavi iz shranjenega `data/raw/free-search-1.html` in strani podrobnosti, če je ta zajem na voljo. Pri napaki zajema se prejšnji dodatek ohrani. `/api/games` vrne združeno zbirko; `/api/report` in poročilo v aplikaciji vključujeta ločen obseg brezplačnega dodatka. Tabela pokritosti osnovnega poročila še vedno opisuje samo prvotni seznam ponudb.

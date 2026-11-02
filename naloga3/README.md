# Naloga 3 – Odprti podatki: Videoigre v številkah

**Avtor:** Tilen Gabor · **Tema:** Pametni iskalnik video iger

Razdelek aplikacije PLAY prikazuje igranje oziroma prenašanje iger v Sloveniji pri prebivalcih, starih 16–74 let. Vsa nova izvorna koda in izvirna datoteka PCAXIS so v mapi `naloga3/`. Glavni strežnik doda pot `/naloga3/`, začetna stran pa povezavo do tega razdelka.

## Lokalni zagon

Potrebujete Node.js 22 ali novejši. V terminalu odprite korensko mapo repozitorija (mapo nad `naloga3`):

```powershell
npm install
npm start
```

Odprite **http://127.0.0.1:3000/naloga3/**. Iskalnik iz prejšnje naloge ostane na **http://127.0.0.1:3000/**. Strežnik posluša samo na lokalnem vmesniku; ustavite ga s Ctrl+C. Za druga vrata pred zagonom nastavite npr. `$env:PORT = 3001`.

Chart.js je lokalna npm odvisnost, zato za grafe ni potreben CDN. Ob prvem nalaganju in vsakem kliku na »Osveži podatke« brskalnik pokliče lokalni API, strežnik pa ponovno prenese izvirni `.px` iz SURS. Dinamičnost ni simulirana s statičnimi vrednostmi. Sočasne zahteve delijo en prenos, zaporedne zahteve vedno znova preverijo vir.

Ob izpadu omrežja ali neveljavnem odgovoru se uporabi zadnja veljavna lokalna datoteka z jasno vidnim opozorilom in časom prenosa. Priložena je dejansko prenesena kopija za lokalno demonstracijo. Brez dosegljivega vira in brez veljavne kopije aplikacija prikaže napako ter omogoči ponovni poskus. Časovna omejitev prenosa je 15 sekund.

## Vir in licenca

- **OPSI:** [Število posameznikov (16–74 let) po namenu uporabe interneta pri uporabnikih interneta, izobrazbi in spolu, Slovenija, letno](https://podatki.gov.si/dataset/surs2974206s).
- **Področje:** Znanost in tehnologija. **Objavitelj:** Statistični urad Republike Slovenije (SURS).
- **Izvorni PCAXIS:** https://pxweb.stat.si/SiStatData/Resources/PX/Databases/Data/2974206S.PX
- **Pregled in opombe:** https://pxweb.stat.si/SiStatData/pxweb/sl/Data/-/2974206S.PX
- **Licenca:** Priznanje avtorstva **CC BY 4.0**. Vir je naveden tudi na spletni strani in v izvozu CSV.
- **Kazalnik:** `STAT1063` – »1.22 Igranje ali prenašanje igric (vključno z igricami za mobilne telefone ali tablice)«.
- **Osnova za delež:** `STAT25` – uporaba interneta v zadnjih treh mesecih, za isto leto, spol in izobrazbo.

Podatki so povezani s tematiko iskalnika prek navad njegove potencialne publike. Ne predstavljajo priljubljenosti konkretnih iger, žanrov ali platform.

## Obdelava in prikaz

1. Prenos izvirnih bajtov `.px` in dekodiranje `windows-1250` glede na metapodatke datoteke.
2. Razčlenjevanje s **Px.js**, npm paket `px`. Preverjanje matrike, merske enote, dimenzij, števila celic in prisotnosti zahtevanih kazalnikov.
3. Izbor celic po dimenzijah **leto × namen uporabe × spol × izobrazba**. Kode skupin so vzete iz vira; skupna vrednost ima kodo `1`.
4. Izračun: `delež = število oseb, ki igrajo ali prenašajo igre / število uporabnikov interneta v isti skupini × 100`.
5. Sprememba se primerja s prejšnjim razpoložljivim letom iste skupine; pri deležu je izražena v odstotnih točkah. Skupne vrednosti so objavljeni agregati SURS. Ne prištevamo jih k podskupinam in ne povprečimo odstotkov.
6. Črtni graf trenda, stolpčni graf po spolu in vodoravni stolpčni graf po izobrazbi s **Chart.js**. Filtri za leto, spol, izobrazbo in mersko enoto se odzovejo brez ponovnega nalaganja strani.

Filter spola velja za povzetek, trend in primerjavo po izobrazbi; graf po spolu primerja oba spola pri izbrani izobrazbi. Filter izobrazbe velja za povzetek, trend in primerjavo po spolu; graf po izobrazbi primerja vse ravni pri izbranem spolu. Kontekst je napisan nad vsakim grafom.

Prenesena tabela ob izvedbi vsebuje leta **2015–2026**, vendar je kazalnik igranja na voljo za **2016, 2018, 2020, 2022, 2024 in 2026**. Nerazpoložljiva leta lahko izberete; v tem primeru povzetek in primerjave pokažejo manjkajoče vrednosti. Trend prikazuje razpoložljiva leta meritev. Vmesnih vrednosti ne interpoliramo. Manjkajoča celica znotraj izbrane skupine prekine črto.

Nenumerične oznake (`..`, `N`, `z` in podobno) ostanejo `null`, nikoli izmišljena ničla. Izvirna oznaka ostane v tabeli in CSV. Dodatne opombe `DATANOTECELL`, npr. `M`, se ohranijo skupaj s pravo celico in prikažejo v tabeli ter namigu grafa. Podrobna razlaga je v opombah in metodologiji SURS. Razlike zaradi zaokroževanja v viru so mogoče.

Tabela omogoča dostop do podatkov tudi brez branja grafov. Izvoz časovne vrste CSV vključuje izbrane skupine, obe števili, neobrezan izračun deleža, izvirne vrednosti, oznake, vir in čas prenosa. Datoteka je UTF-8 z BOM, ločilo je podpičje, decimalno ločilo vejica. Na voljo je tudi prenos izvirne datoteke `.px`.

## Datoteke

| Datoteka | Namen |
| --- | --- |
| `data.js` | Dinamični prenos, Px.js, preverjanje, izračun deležev in lokalna kopija |
| `routes.js` | Lokalni API `/naloga3/api/data`, statične datoteke in prenos `.px` |
| `model.js` | Izbor skupin, primerjave in sprememba glede na prejšnjo meritev |
| `index.html`, `style.css`, `app.js` | Odziven spletni prikaz s Chart.js, filtri in CSV |
| `data/2974206S.px` | Dejanska izvirna datoteka SURS; ob uspešnem prenosu se osveži |
| `data/source.json` | Čas prenosa in SHA-256 za preverjanje izvora lokalne kopije |
| `data.test.js` | Testi razčlenjevanja, izračunov, oznak, izpadov in obnovitve |

## Preverjanje

V korenski mapi repozitorija:

```powershell
npm test                         # tudi obstoječi testi parserja in iskalnika
npm run test:naloga3              # samo testi naloge 3; brez dostopa do omrežja
```

Testi preverijo znane celice priložene datoteke za 2024, šumnike, večdimenzionalni izbor, manjkajoče vrednosti, opombo M, osnovo odstotkov, prejšnjo meritev, primerjave brez podvajanja agregatov, zavrnitev poškodovanega vira, ponovni prenos, združevanje sočasnih zahtev in uporabo kopije ob izpadu. Če SURS revidira zgodovinske vrednosti ali strukturo in posodobite priloženo datoteko, ustrezno preverite tudi pričakovane vrednosti testov.

Knjižnica Px.js je starejša; njena odvisnost Underscore je z `overrides` nastavljena na popravljeno različico `^1.13.8`. Ne izvajamo kode iz PCAXIS. SHA-256 in čas posodobitve vira sta prikazana na strani.

# Pametni iskalnik video iger

**Predmet:** Tehnologije integracije in digitalizacij  
**Avtor:** Tilen Gabor  
**Status:** načrt projekta

## 1. Povzetek

Projekt je pametni iskalnik videoiger, ki združi podatke o igrah iz kataloga RAWG s cenami in ponudbami iz storitve CheapShark. Uporabnik vnese naslov igre in po želji izbere zvrst, platformo, minimalno oceno ali najvišjo ceno. Aplikacija prikaže ujemajoče se igre, osnovne podatke o njih ter aktualne ponudbe v podprtih spletnih trgovinah.

»Pametni« del iskanja bo v prvi različici temeljil na kombinaciji iskanja po besedilu, filtrih in razvrščanju. Rezultate obeh storitev bomo povezali po naslovu igre; kjer bo na voljo Steam App ID, ga bomo uporabili kot zanesljivejši povezovalni ključ za poizvedbe CheapShark.

## 2. Cilj in obseg

### Cilji

- Iskanje videoiger po naslovu.
- Filtriranje po zvrsti, platformi, oceni in cenovnem razponu.
- Prikaz opisa, datuma izdaje, zvrsti, platform, ocene in naslovnice igre.
- Primerjava trenutnih cen med trgovinami, ki jih pokriva CheapShark.
- Odhod na ponudbo prek povezave CheapShark.
- Enoten prikaz podatkov iz več neodvisnih storitev.

### Predviden uporabniški potek

1. Uporabnik vnese naslov ali del naslova ter izbere želene filtre.
2. Zaledni del pošlje poizvedbo v RAWG in pridobi seznam kandidatov z metapodatki.
3. Za najdene igre poišče ponudbe v CheapShark; kadar je znan Steam App ID, ga uporabi za natančnejše ujemanje.
4. Zaledni del združi rezultate v skupni model, odstrani podvojene zapise in jih razvrsti po ujemanju, oceni ali ceni.
5. Uporabnik odpre podrobnosti igre ali sledi povezavi do ponudbe.

## 3. Storitve in dokumentacija

### RAWG Video Games Database API

RAWG je katalog videoiger z metapodatki o igrah, zvrsteh, platformah, razvijalcih, datumih izdaje, ocenah in naslovnicah.

- Dokumentacija: [RAWG API docs](https://api.rawg.io/docs/)
- Vodnik za uporabo: [RAWG API docs portal](https://rawg.io/apidocs)
- Osnovni API: `https://api.rawg.io/api`
- Uporabljeni vir: `GET /games`, z iskalnim nizom `search` ter filtri, kot so zvrst, platforma in ocena.
- Avtentikacija: ključ API, poslan kot parameter `key`. Ključ bo shranjen v lokalni konfiguraciji oziroma okoljskih spremenljivkah in ne bo objavljen v repozitoriju.
- Uporaba: iskanje iger ter pridobivanje njihovih opisnih metapodatkov.
- Zahteva RAWG za brezplačno osebno rabo: navedba vira RAWG in aktivna povezava na vsaki strani, kjer so uporabljeni njihovi podatki oziroma slike. V uporabniškem vmesniku bo zato prikazan pripis »Podatki in slike: RAWG« s povezavo.

### CheapShark API

CheapShark zbira podatke o cenah in akcijah za računalniške igre v več digitalnih trgovinah.

- Dokumentacija: [CheapShark API docs](https://apidocs.cheapshark.com/)
- Osnovni API: `https://www.cheapshark.com/api/1.0`
- Uporabljena vira:
  - `GET /games?title={naslov}` za iskanje igre po imenu in najcenejši trenutni ponudbi.
  - `GET /deals?title={naslov}` oziroma `GET /deals?steamAppID={id}` za seznam ponudb in primerjavo trgovin.
- Avtentikacija: API ključ ni potreben. Zahtevam bo dodano uporabniško določilo `User-Agent`, kot zahteva dokumentacija.
- Omejitve podatkov: cene so v USD, datumi so Unix časovni žigi, podatki o cenah se praviloma osvežujejo približno enkrat na uro.
- Povezave: pri prikazu ponudbe bo uporabljena preusmeritvena povezava CheapShark oblike `https://www.cheapshark.com/redirect?dealID={dealID}`.

## 4. Podatki, ki se prenašajo

Vse komunikacije z izbranima storitvama potekajo prek HTTPS. Odgovori so JSON. Aplikacija ne potrebuje uporabniških računov in v prvi različici ne pošilja osebnih podatkov.

### Zahteva v RAWG

Primer: `GET https://api.rawg.io/api/games?key={API_KEY}&search=Hades&page_size=10`

V zahtevi se prenesejo ključ API in iskalni parametri: besedilo, zvrst, platforma, razpon ocen ter številka strani. API ključ je skrivnost in se ne sme zapisati v izvorno kodo, README ali Git zgodovino.

### Odgovor RAWG (izbor polj)

```json
{
  "count": 1,
  "results": [
    {
      "id": 12345,
      "name": "Hades",
      "slug": "hades-2020",
      "released": "2020-09-17",
      "background_image": "https://media.rawg.io/...jpg",
      "rating": 4.5,
      "metacritic": 93,
      "genres": [{ "id": 4, "name": "Action" }],
      "platforms": [{ "platform": { "id": 4, "name": "PC" } }]
    }
  ]
}
```

Uporabljena polja: RAWG ID, ime, slug, datum izdaje, URL naslovnice, ocena, Metacritic ocena, zvrsti in platforme. Podroben opis lahko pridobimo dodatno za izbrano igro z `GET /games/{id}`.

### Zahteva v CheapShark

Primer: `GET https://www.cheapshark.com/api/1.0/deals?title=Hades&pageSize=10`

V zahtevi se prenese naslov igre oziroma Steam App ID ter neobvezni filtri in omejitev števila rezultatov.

### Odgovor CheapShark (izbor polj)

```json
[
  {
    "internalName": "HADES",
    "title": "Hades",
    "steamAppID": "1145360",
    "dealID": "primerDealID",
    "storeID": "1",
    "salePrice": "9.99",
    "normalPrice": "24.99",
    "savings": "60.024010",
    "dealRating": "9.2",
    "thumb": "https://...jpg"
  }
]
```

Uporabljena polja: naslov, Steam App ID (če je na voljo), ID ponudbe, ID trgovine, trenutna in običajna cena, odstotek prihranka, ocena ponudbe ter sličica. Podatke bomo pri prikazu pretvorili v ustrezne tipe: cene in ocene v decimalna števila, odstotek prihranka v število, identifikatorje v nize.

### Interni združeni model

Zaledni del bo odgovore preoblikoval v poenoten objekt:

```json
{
  "title": "Hades",
  "sourceIds": { "rawg": 12345, "steamAppId": "1145360" },
  "releaseDate": "2020-09-17",
  "genres": ["Action", "Indie"],
  "platforms": ["PC", "Nintendo Switch"],
  "rating": 4.5,
  "coverUrl": "https://media.rawg.io/...jpg",
  "offers": [
    {
      "storeId": "1",
      "price": 9.99,
      "regularPrice": 24.99,
      "savingsPercent": 60.02,
      "dealUrl": "https://www.cheapshark.com/redirect?dealID=primerDealID"
    }
  ]
}
```

## 5. Načrt integracije

```text
Uporabniški vmesnik
        |
        v
Zaledni del / iskalna logika
   |                 |
   v                 v
RAWG API         CheapShark API
metapodatki      cene in ponudbe
   |                 |
   +------ združevanje po naslovu / Steam App ID ------+
                          |
                          v
                 Enotni rezultati iskanja
```

1. Uporabniški vmesnik preveri, da iskalni niz ni prazen, in pošlje poizvedbo zalednemu delu.
2. Zaledni del normalizira iskalni niz, omeji zahtevane rezultate in pokliče RAWG.
3. Za vsak primeren zadetek poišče ponudbe v CheapShark. Poizvedbe bomo omejili oziroma združili, da ne ustvarimo nepotrebnega števila zahtev.
4. Rezultate povežemo najprej po Steam App ID, kadar je na voljo, sicer po normaliziranem naslovu. Pri dvoumnih naslovih ponudbe prikažemo kot približno ujemanje ali jih izpustimo.
5. Vrednosti pretvorimo v enoten tipiziran model, podvojene igre odstranimo in rezultate razvrstimo.
6. Ob napaki enega ponudnika prikažemo podatke drugega ponudnika ter uporabniku povemo, kateri del trenutno ni na voljo.

## 6. Tehnična zasnova

Predvidena zasnova za izvedbo:

- **Odjemalec:** spletni uporabniški vmesnik za iskanje, filtre, rezultate in ponudbe.
- **Zaledni del:** enotna iskalna pot, klici zunanjih API-jev, pretvorba podatkov, povezovanje rezultatov in obravnava napak.
- **Nastavitve:** RAWG ključ API v datoteki `.env`, ki ni del repozitorija; primer nastavitev bo v `.env.example`.
- **Predpomnilnik:** kratkotrajno predpomnjenje rezultatov iskanja zmanjša število ponovljenih klicev. Cene ne bomo prikazovali kot zagotovljeno trenutno ceno; prikazali bomo čas zadnje osvežitve, če bo na voljo.
- **Prenos:** HTTPS in JSON.

Konkreten jezik, ogrodje in hramba se določijo ob začetku implementacije. Za prvo različico trajna baza ni nujna; rezultati iskanja so lahko začasni.

## 7. Varnost, kakovost in omejitve

- RAWG ključ hranimo samo na strežniški strani oziroma v okoljski konfiguraciji. `.env` bo v `.gitignore`.
- Ne beležimo ključev API ali nepotrebnih podatkov uporabnika.
- Preverimo status HTTP, časovne omejitve, manjkajoča polja in neveljavne JSON odgovore.
- Pri izpadu storitve lahko še vedno prikažemo rezultate druge storitve.
- Naslovi se ne ujemajo vedno popolnoma: možne so različice naslovov, remasterji in podobna imena. Steam App ID, kjer obstaja, zmanjša napačne povezave.
- CheapShark pokriva računalniške igre in določene trgovine; ni celovit cenik vseh platform ali regij. Cene v USD in njihova razpoložljivost se lahko razlikujejo od uporabnikove regije.
- Podatki o cenah se spreminjajo. CheapShark navaja približno urno osveževanje; stran trgovine ostaja merodajna pred nakupom.
- Upoštevamo pogoje uporabe in atribucijo RAWG ter povezave CheapShark za ponudbe.

## 8. Koraki izvedbe

1. Ustvariti osnovno ogrodje aplikacije in konfiguracijo za zunanje storitve.
2. Pridobiti RAWG ključ API in preveriti iskanje iger.
3. Implementirati CheapShark poizvedbe za naslove ter ponudbe.
4. Določiti in implementirati skupni model podatkov ter povezovanje rezultatov.
5. Dodati vmesnik, filtre, razvrščanje in povezave do ponudb.
6. Preveriti tipične primere: znan naslov, brez zadetkov, več različic igre, nedosegljiv ponudnik in manjkajoča ponudba.
7. V README dopolniti končno arhitekturo, navodila za zagon in rezultate preverjanja po implementaciji.

## 9. Navodila za zagon

Ta repozitorij za zdaj vsebuje načrt projekta. Navodila za namestitev in zagon aplikacije bodo dodana, ko bo izbrano in implementirano ogrodje.

## 10. GitHub in oddaja

- Predvideno ime repozitorija: **Pametni iskalnik video iger - tehnologije integracije in digitalizacij**.
- V GitHub repozitorij bo treba dodati asistenta **alenrajsp** in **patrikrek** kot sodelavca.
- Povezavo do repozitorija je treba priložiti pri oddaji naloge.
- Izbiro projekta je treba vnesti tudi v [skupno preglednico](https://univerzamb-my.sharepoint.com/:x:/g/personal/patrik_rek_um_si/IQAqSyZ5dO7bQIpPohI6SAGzAXpZQfsusSOphBxeUrk-Uzw?e=YOx3bw).

## Viri

- [RAWG API dokumentacija](https://api.rawg.io/docs/)
- [RAWG API pogoji in začetek uporabe](https://rawg.io/apidocs)
- [CheapShark API dokumentacija](https://apidocs.cheapshark.com/)

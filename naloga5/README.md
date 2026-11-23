# Naloga 5 – gRPC: Igre v toku

Nadgradnja obstoječega pametnega iskalnika videoiger v Node.js. Po nalogi 6 vsi RPC klici berejo katalog iz baze SQLite; začetni uvoz iz JSON in samodejno osveževanje sta opisana v [nalogi 6](../naloga6/README.md). Uporabnik izbere filtre in zahteva seznam, podrobnosti igre, statistiko ali sprotno pretakanje iger. Uporablja se dejanski shranjeni katalog iz naloge 2 (`readGames`, vključno z brezplačnimi igrami).

## Zagon

Potrebuješ Node.js 22 ali novejši. V korenu projekta:

```sh
npm ci
npm start
```

Odpri **http://127.0.0.1:3000/naloga5/**. En ukaz zažene spletni strežnik na vratih 3000 in gRPC strežnik na `127.0.0.1:50051`. Odjemalec uporablja pravo omrežno gRPC povezavo tudi pri skupnem procesu. API ključ ni potreben. Obstoječa `.env` za nalogo 4 ostane uporabna.

Za jasno ločena procesa lahko zaženeš tudi:

Prvi terminal:

```sh
npm run grpc
```

Drugi terminal (PowerShell):

```powershell
$env:GRPC_TARGET = '127.0.0.1:50051'
npm start
```

`GRPC_TARGET` pove spletnemu strežniku, naj uporabi že zagnano storitev. `GRPC_ADDRESS` pri samostojnem strežniku določa naslov poslušanja. `PORT` določa spletna vrata. Če se vrneš na skupni zagon, v drugem terminalu odstrani nastavitev z `Remove-Item Env:GRPC_TARGET` in ustavi samostojni strežnik.

Lokalna demonstracija uporablja `createInsecure()` in posluša na povratnem naslovu. Za gostovanje na drugem računalniku je treba dodati TLS in ustrezno konfiguracijo omrežja.

## Izpolnjene zahteve

V datoteki [igre.proto](igre.proto) je **1 service `IgreService`**, **4 RPC klici**, podatkovno sporočilo `Igra` in sporočila za zahtevke ter odgovore.

| RPC | Vrsta | Uporabniška akcija | Rezultat |
| --- | --- | --- | --- |
| `PoisciIgre` | unary | Prikaži seznam | Filtrirane in razvrščene igre, skupno število zadetkov in čas zajema |
| `PridobiIgro` | unary | Podrobnosti na kartici | Opis, cena, ocena in povezava izbrane igre |
| `PridobiStatistiko` | unary | Statistika zadetkov | Število iger, brezplačnih iger ter povprečna cena vseh zadetkov |
| `PretakajIgre` | server streaming | Začni pretakanje | Posamezne igre, napredek in sprotni izračuni za prejeti del toka |

Filtri: iskalni niz, platforma, zvrst (prek protokola), najvišja cena, samo brezplačne igre in vrstni red. `limit` omeji stran na največ 100 iger, `offset` omogoča naslednje strani prek protokola/API. Spletni obrazec prikaže prvo stran izbrane velikosti in skupno število zadetkov.

## Pot podatkov

```text
Brskalnik (obrazec, fetch / EventSource)
   ↕ HTTP JSON / SSE
Node.js spletni strežnik + gRPC odjemalčev stub (client.js, routes.js)
   ↕ gRPC / HTTP/2 / binarni Protocol Buffers
IgreService na vratih 50051 (service.js)
   ↓ readGames() → filtriranje → obdelava
data/games.json + data/free-games.json
```

Brskalnik uporablja HTTP prehod. **Dejanska povezava aplikacije s podatkovno storitvijo je gRPC**; prehod ne bere kataloga in vse štiri operacije izvede prek nastavka. SSE samo posreduje sporočila gRPC toka v brskalnik, brez čakanja na celoten odgovor. Pri zaprtju povezave ali kliku »Ustavi tok« prehod prekliče gRPC klic. Upoštevana sta tudi nadzor pretoka in časovna omejitev.

`@grpc/proto-loader` in `grpc.loadPackageDefinition` med izvajanjem iz `.proto` ustvarita opis storitve in nastavke ter serializatorje. Ločen korak s `protoc` ni potreben, tako kot pri dinamičnem Node.js primeru v gradivu. [Uradni Node.js vodič gRPC](https://grpc.io/docs/languages/node/basics/) opisuje ta način nalaganja protokola.

## Primer obdelave v realnem času

Ob izbiri uporabnika se odpre en `PretakajIgre` klic. Storitev za vsako poslano igro posodobi število obdelanih iger, število brezplačnih iger in povprečno ceno ter jih pošlje v `partial_stats`. Brskalnik takoj dopolni kartice, napredek in statistiko. Zadnje sporočilo vsebuje `done = true`, tudi če ni zadetkov.

Povprečje vključuje znane cene v EUR in brezplačne igre. Neznane cene in cene drugih valut izloči. `optional double` loči neznano ceno od cene 0; enako velja za oceno. Pri toku statistika opisuje prejeti del izbrane strani, pri ločenem klicu za statistiko pa vse zadetke filtrov.

Vir je zadnji shranjeni zajem Steam, **ne neposredno spremljanje cen na Steamu**. Zaradi pregledne demonstracije je med sporočili 80 ms razmika; v `createGrpcServer` lahko `streamDelayMs` nastaviš na 0. Vsak klic ponovno prebere katalog, zato naslednji zahtevek upošteva morebitno osvežitev parserja. Cene in čas zajema so prikazani kot zgodovinski podatki.

## Predstavitev pri zagovoru

1. Odpri `/naloga5/` ter pokaži `igre.proto`: service, štiri metode, `stream`, zahtevki in odgovori.
2. Označi »Samo brezplačne igre«, izberi 24 rezultatov in klikni »Začni pretakanje«. Kartice in statistika se sproti dopolnjujejo; povprečje je 0 €.
3. Izberi 100 rezultatov, ponovno zaženi tok in klikni »Ustavi tok«. Prejeti rezultati ostanejo.
4. Klikni »Prikaži seznam«, nato »Podrobnosti« pri izbrani igri. To sta dva različna unary klica.
5. Klikni »Statistika zadetkov«. Izračun velja za vse zadetke trenutnih filtrov.
6. Poišči neobstoječe besedilo in zaženi tok: prikaže se obvestilo brez zadetkov.
7. Za dokaz ločenih komponent uporabi dva terminala; ustavi samostojni gRPC strežnik in pokaži obvestilo o nedosegljivi storitvi.

## Preverjanje

```sh
npm run test:naloga5
npm test
```

Integracijski testi vzpostavijo gRPC strežnik na prostih vratih ter prek pravega nastavka preverijo filtre, strani, razlikovanje 0/neznana cena, ID-je, statistiko, vrstni red sporočil, prazen tok, preklic, neveljavne zahteve in izpad kataloga. Test HTTP prehoda preveri JSON, SSE in nedosegljiv gRPC strežnik. Testi ne potrebujejo Steama ali LLM ponudnika.

Datoteke: `protocol.js` nalaga protokol, `service.js` izvaja poslovno logiko, `client.js` ustvari odjemalca, `routes.js` povezuje spletno aplikacijo s storitvijo, `server.js` omogoča samostojni zagon, `app.js` upravlja uporabniški vmesnik.

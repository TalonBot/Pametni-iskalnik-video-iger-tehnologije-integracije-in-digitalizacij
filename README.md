# Pametni iskalnik video iger

**Avtor:** Tilen Gabor | **Predmet:** Tehnologije integracije in digitalizacij

## Povzetek

Ideja je narediti aplikacijo, ki pomaga najti igre za igranje. Uporabnik bo lahko iskal po imenu, filtriral in sortiral igre ter primerjal njihove cene. Aplikacija bo znala tudi predlagati igre glede na to, kaj je uporabnik prej označil ali ocenil.

Za začetek bi uporabnik svoje priljubljene igre izbral v aplikaciji. Mogoce bom pozneje dodal še povezavo s Steam računom, da bodo priporočila upoštevala igre v njegovi knjižnici in čas igranja.

## Panoga in uporabljene storitve

Projekt spada na področje videoiger in spletnih storitev za iskanje ter priporočanje izdelkov. Aplikacija bo združila podatke dveh storitev:

- **RAWG** bo dal osnovne podatke o igrah, na primer ime, opis, zvrst, platforme, datum izdaje, oceno in sliko.
- **CheapShark** bo dal podatke o cenah in popustih v spletnih trgovinah.
- **Steam Web API** je možna dodatna storitev za osebna priporočila. Začetna različica lahko deluje tudi brez povezave s Steamom.

RAWG in CheapShark sta glavni storitvi prve različice. Aplikacija bo podatke o isti igri združila po naslovu, če je na voljo, pa ji bo pri povezovanju pomagal tudi Steam App ID.

## Kaj je uporabno pri ideji

Uporabniku ne bo treba posebej iskati podatkov o igri na eni strani in cen na drugi. Na enem mestu bo lahko našel igro, videl osnovne informacije in primerjal ponudbe. Če bo aplikacija poznala njegove prejšnje izbire, mu bo lahko pokazala tudi podobne igre.

Sama ideja priporočil ni nujno nova, uporabna pa je povezava priporočil, običajnega iskanja in primerjave cen v eni aplikaciji. Priporočila lahko najprej temeljijo na igrah, ki jih uporabnik označi ali oceni v aplikaciji.

## Storitve in dokumentacija

### RAWG

RAWG je podatkovna zbirka videoiger.

- Dokumentacija: [RAWG API docs](https://api.rawg.io/docs/)
- Aplikacija bo poslala iskalno besedilo in po želji filter, kot sta zvrst ali platforma. Za podroben opis izbrane igre bo lahko poslala še njen RAWG ID.
- Za uporabo API-ja potrebujemo ključ. V aplikaciji bomo navedli RAWG kot vir podatkov in slik.

### CheapShark

CheapShark zbira ponudbe računalniških iger iz več spletnih trgovin.

- Dokumentacija: [CheapShark API docs](https://apidocs.cheapshark.com/)
- Aplikacija bo poslala naslov igre ali Steam App ID in poiskala aktualne ponudbe.
- Ključ API ni potreben. Podatki vključujejo trgovino, ceno, popust in povezavo do ponudbe. Cene so v ameriških dolarjih.

### Steam Web API

Steam bi povezali, če bomo hoteli priporočila prilagoditi knjižnici in času igranja uporabnika.

- Dokumentacija: [Steam Web API, IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService)
- Aplikacija bi poslala Steam ID in API ključ, Steam pa bi lahko vrnil seznam iger in čas igranja.
- Podatki o igrah morajo biti uporabniku vidni v nastavitvah zasebnosti. Če povezava ne bo delovala ali je ne bomo vključili, bo uporabnik igre označil sam v aplikaciji.

## Podatki, ki se bodo prenašali

Storitve bodo prejemale zahteve in vračale odgovore v obliki **JSON**. Ne prenašamo Wordovih ali drugih dokumentov; prenašajo se podatki o igrah in ponudbah.

- **RAWG:** zahteva vsebuje iskalno besedilo, filtre in API ključ. Odgovor lahko vsebuje igre s polji `id`, `name`, `description`, `released`, `rating`, `genres`, `platforms` in `background_image`. Identifikator in ocena sta številska, ime in opis sta besedilo, zvrsti in platforme so seznami, datum je zapisan kot datum, slika pa kot spletni naslov.
- **CheapShark:** zahteva vsebuje naslov igre ali Steam App ID. Odgovor lahko vsebuje `title`, `steamAppID`, `storeID`, `dealID`, `salePrice`, `normalPrice`, `savings` in povezavo do ponudbe. ID-ji so nizi, cene in prihranek pa storitev pošlje kot besedilne vrednosti; aplikacija jih pretvori v števila za primerjavo.
- **Steam (če ga vključimo):** zahteva vsebuje Steam ID in API ključ. Odgovor v JSON lahko vsebuje ID igre (`appid`), ime in čas igranja (`playtime_forever`).
- **Izbire v aplikaciji:** uporabnik lahko izbere ali oceni igro ter vnese iskalni niz in filtre. Aplikacija te podatke uporabi za predloge in prikaz rezultatov.

## Akterji

- **Uporabnik** išče igre, izbere filtre, označi priljubljene igre in odpre povezavo do ponudbe.
- **Aplikacija** pošlje poizvedbe, združi podatke RAWG in CheapShark ter pripravi predloge.
- **RAWG** vrne podatke o igrah.
- **CheapShark** vrne podatke o cenah in ponudbah.
- **Steam** lahko vrne uporabnikovo knjižnico in čas igranja, če bomo povezavo dodali in so podatki vidni.

## Kako bodo storitve sodelovale

```text
Uporabnik vnese iskanje ali izbere svoje priljubljene igre
                         |
                         v
                Aplikacija poišče igre
                    /           \
                   v             v
             RAWG: podatki    CheapShark: cene
                    \           /
                     v         v
             Aplikacija združi rezultate
                         |
                         v
        Igre, priporočila in povezave do ponudb

Steam (možno pozneje) ---> seznam iger in čas igranja
                           za osebna priporočila
```

## Viri

- [RAWG API dokumentacija](https://api.rawg.io/docs/)
- [CheapShark API dokumentacija](https://apidocs.cheapshark.com/)
- [Steam Web API, IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService)
- ChatGPT (OpenAI), pomoč pri oblikovanju besedila načrta, 12. 10. 2026.

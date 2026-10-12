# Pametni iskalnik video iger

**Avtor:** Tilen Gabor | **Predmet:** Tehnologije integracije in digitalizacij

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

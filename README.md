# Pametni iskalnik video iger

## Ideja

Rad bi naredil aplikacijo, ki pomaga najti novo igro za igranje. Poleg navadnega iskanja bi predlagala igre glede na to, kaj je uporabniku že všeč. Uporabnik bo lahko igre iskal po imenu, jih filtriral in sortiral ter primerjal njihove cene.

## Kaj bo aplikacija znala

- Predlagati igre glede na uporabnikove prejšnje izbire in ocene.
- Omogočiti običajno iskanje po imenu igre.
- Filtrirati in sortirati rezultate, na primer po zvrsti, platformi, oceni ali ceni.
- Pokazati osnovne podatke o igri in ponudbe iz spletnih trgovin.

Za začetek lahko uporabnik v aplikaciji označi igre, ki so mu všeč. Pozneje bi lahko ponudili še povezavo s Steam računom. Steam API lahko vrne seznam iger in čas igranja, če so podatki o igrah na profilu vidni. To bi lahko priporočila še bolj prilagodilo uporabniku, vendar je ta možnost odvisna od nastavitev zasebnosti profila in jo bomo preverili med izdelavo.

## Storitve, ki jih nameravam uporabiti

### RAWG

Vir podatkov o igrah: imena, opisi, zvrsti, platforme, datum izdaje, ocene in slike.

- [RAWG API dokumentacija](https://api.rawg.io/docs/)
- Uporabili bomo iskanje iger in njihove osnovne podatke. API zahteva ključ.
- Pri uporabi podatkov in slik bomo navedli RAWG kot vir.

### CheapShark

Vir cen in akcij za računalniške igre v različnih spletnih trgovinah.

- [CheapShark API dokumentacija](https://apidocs.cheapshark.com/)
- Uporabili bomo iskanje igre po naslovu in seznam ponudb.
- API vrne na primer trgovino, trenutno in običajno ceno, popust ter povezavo do ponudbe. Ključ ni potreben.

### Steam Web API

Steam bi uporabili, če bomo želeli priporočila prilagoditi uporabnikovi knjižnici in času igranja. Podatke o uporabnikovih igrah lahko dobimo, kadar so ti podatki na profilu javno vidni.

- [Steam Web API dokumentacija](https://partner.steamgames.com/doc/webapi/IPlayerService)
- Vir podatkov bi bil seznam iger in po možnosti čas igranja. Steam za API zahteva ključ.
- Če povezava s Steamom ne bo primerna, bo aplikacija priporočila še vedno lahko sestavila iz iger, ki jih uporabnik označi kar v naši aplikaciji.

## Podatki in povezovanje

Storitve vračajo podatke v obliki JSON. Aplikacija jih združi po naslovu igre, pri ponudbah pa, kjer je na voljo, uporabi Steam App ID.

- **RAWG:** ime, opis, zvrst, platforme, datum izdaje, ocena in slika igre.
- **CheapShark:** naslov igre, trgovina, cena, popust in povezava do ponudbe. Cene so v ameriških dolarjih.
- **Steam (če ga vključimo):** Steam ID, ID igre in čas igranja. Iz teh podatkov bi aplikacija sklepala, katere igre so uporabniku všeč.
- **Naša aplikacija:** uporabnikove označene ali ocenjene igre ter izbrani filtri.

Na podlagi teh podatkov aplikacija pokaže igre, ki bi uporabnika lahko zanimale, in ponudbe zanje. Steam povezava je za zdaj dodatna možnost; osnovno iskanje, filtri in ročno izbrane igre za priporočila lahko delujejo tudi brez nje.

## Viri

- [RAWG API dokumentacija](https://api.rawg.io/docs/)
- [CheapShark API dokumentacija](https://apidocs.cheapshark.com/)
- [Steam Web API – IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService)
- ChatGPT (OpenAI), pomoč pri oblikovanju besedila načrta, 12. 10. 2026.
- 

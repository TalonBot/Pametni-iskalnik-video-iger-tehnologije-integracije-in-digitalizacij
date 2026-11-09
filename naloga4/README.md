# Naloga 4 – Uporaba LLM

Funkcionalnost je del projekta **PLAY / Pametni iskalnik video iger**. Odpri **http://127.0.0.1:3000/naloga4/** ali povezavo **AI priporočila** na glavni strani.

## Namestitev in zagon

Potrebuješ Node.js 22 ali novejši in svoj Google Gemini API ključ iz [Google AI Studio](https://aistudio.google.com/apikey). Dostopnost modela in kvota sta odvisni od računa ponudnika.

V mapi projekta:

```powershell
npm install
Copy-Item .env.example .env
notepad .env
npm start
```

V `.env` nastavi `GEMINI_API_KEY` na svoj ključ. Datoteke `.env` ne oddajaj in je ne dodajaj v Git. Če `.env` že obstaja, jo samo dopolni. `GEMINI_MODEL` privzeto izbere `gemini-3.1-flash-lite`; po potrebi vnesi drug model Gemini s podporo strukturiranemu izhodu. Po spremembi nastavitev znova zaženi strežnik. Ključ se uporablja samo na strežniku, v glavi zahteve ponudniku, in se ne pošilja brskalniku.

## Izpolnjevanje zahtev

1. **Dinamična integracija:** obrazec pošlje `POST /naloga4/api/recommend`. Strežnik ob vsaki oddaji resnično pokliče Gemini `generateContent`; priporočila niso vnaprej pripravljena ali predpomnjena.
2. **Dinamični prompt:** sestavljen je iz opisa želja, platforme, proračuna, zvrsti, načina igranja, časa zajema in do 40 iger iz obstoječe zbirke naloge 2. Platforma, proračun in zvrst omejijo kandidate. Besedilno ujemanje in način igranja vplivata na vrstni red pred izborom največ 40 kandidatov; to ni semantično iskanje po celotni zbirki. LLM med kandidati izbere do tri igre in razloži izbiro.
3. **JSON:** zahteva določi `responseMimeType: application/json` in `responseJsonSchema`. V aplikaciji se odgovor najprej razčleni z `JSON.parse`, nato deserializira v **`LlmOdgovor`** in njegove objekte **`PriporociloIgre`**. Razreda preverita tipe, obvezna polja, število priporočil in podvojene ID-je. Strežnik dodatno preveri, da je vsak ID med dovoljenimi kandidati. Enaka razreda uporablja odjemalec.

Primer oblike JSON (ponazoritev strukture, ne dejanski odgovor ponudnika):

```json
{
  "povzetek": "Izbral sem igro glede na tvoje želje.",
  "priporocila": [
    {
      "appId": "12345",
      "razlog": "Pojasnilo povezave z uporabnikovimi željami.",
      "opozorilo": "Opozorilo glede nepotrjenih lastnosti igre."
    }
  ]
}
```

Imena, cene, slike in povezave se dodajo iz preverjenega lokalnega kataloga. Model teh vrednosti ne določa. Trdi filtri zagotavljajo ustreznost glede na znane podatke kataloga, ne današnjih cen ali dejanskih zahtev uporabnikovega računalnika. Način igranja je mehka želja. Razlaga AI je lahko napačna. Uporabniški vnos se ponudniku pošlje skupaj s kandidati, kar pojasni tudi obrazec.

## Prikaz pri zagovoru

1. Odpri **AI priporočila** in vnesi na primer »Iščem sproščeno raziskovalno igro z zgodbo, brez tekmovalnega pritiska.« Izberi Windows, 25 € in igranje sam.
2. Klikni **Poišči moje igre**. Aplikacija prikaže povzetek, igre, razloge, opozorila, cene ob zajemu in povezave na Steam.
3. Odpri **Kako je AI prišel do izbire?**: tam sta dejanski poslani prompt in programsko obdelan JSON. Rezultat lahko preneseš.
4. Spremeni želje in proračun (npr. 0 €) ter po kratkem premoru ponovno oddaj. Primerjaj prompt in priporočila. Različni vnosi ne zagotavljajo različnih priporočil, če so primerni kandidati isti.

Manjkajoči ključ, napačni vnosi, prazni kandidati, omrežna napaka, 45-sekundna časovna omejitev, kvota ponudnika in neveljavni odgovori imajo svoja obvestila. Strežnik dopušča en sočasen klic; po uspešnem klicu zahteva 10 sekund premora. Brez ključa ni nadomestnih izmišljenih priporočil.

## Datoteke in preverjanje

| Datoteka | Namen |
| --- | --- |
| `llm.js` | Vhodna validacija, izbor kandidatov, sestava prompta, klic ponudnika in preverjanje odgovora. |
| `model.js` | Razreda za deserializacijo in JSON shema. |
| `routes.js` | Statične strani, stanje konfiguracije in POST API. |
| `index.html`, `app.js`, `style.css` | Obrazec, programski prikaz, pregled prompta in JSON, izvoz. |
| `llm.test.js` | Testi z nadzorovanimi simuliranimi odgovori ponudnika, brez porabe kvote. |

```powershell
npm run test:naloga4
npm test
```

Samodejni testi preverjajo dinamični prompt, dejansko strukturo odhodne zahteve, pretvorbo v razrede, filtre, izmišljene ID-je, neveljavni JSON, HTTP napake in časovno omejitev. Uspeh testov s simulacijo ne dokazuje dejanskega klica Gemini; tega preveriš v zgornjem postopku s svojim ključem.

### Preverjeno z dejanskim ponudnikom, 10. 11. 2026

Uporabljen je `gemini-3.1-flash-lite`, ki je z nastavljenim ključem uspešno vrnil strukturirane odgovore. Model `gemini-3.8-flash` je med preverjanjem vračal napako storitve oziroma presegel časovno omejitev, zato ga aplikacija privzeto ne uporablja.

- Obrazec v brskalniku: želja po raziskovanju in zgodbi, Windows, 25 €, samostojno igranje. Prikazane igre: Subnautica, Undertale in No Man's Sky. Preverjena sta razpiranje dejanskega prompta in JSON ter prenos `llm-priporocila.json`; preneseni odgovor je uspešno prestal deserializacijo v `LlmOdgovor`.
- Drug dejanski POST klic: brezplačna akcijska igra s prijatelji, Windows, 0 €. HTTP 200 v približno 3,5 sekunde; Warframe, Counter-Strike 2 in THE FINALS. Preverjeno je, da imajo vse priporočene igre ceno 0 in da se prompt razlikuje od prvega primera.
- Celotna zbirka 33 samodejnih testov uspešno prestane preverjanje. Ključ ostaja samo v lokalni, iz Gita izključeni datoteki `.env`.

Navedene igre so rezultati teh konkretnih klicev; nova zahteva lahko vrne drugačen izbor.

Dokumentacija: [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [generateContent REST API](https://ai.google.dev/api/generate-content).

# Vegesauruksen arkiruokia

Verkkosovellus (PWA), jolla suunnitellaan viikon kasvisruoat. Jokaisella viikonpäivällä on oma
ruokateema ja 14 valmista ruokavaihtoehtoa. Valitset päivien ruoat valintaruuduilla ja näet lopuksi
viikon yhteenvedon, jonka voit kopioida tekstinä.

Ruoissa ei ole lihaa, kalaa eikä sieniä. Maitotuotteet ovat sallittuja. Kananmunaa voi olla raaka-aineena
esimerkiksi taikinassa, mutta ei näkyvänä osana ruokaa.

Voit myös lisätä omia ruokia ja reseptilinkkejä, merkitä ruokia vegaanisiksi ja vaihtaa teemoja ja värejä.
Sovellus toimii ensimmäisen avauksen jälkeen myös ilman verkkoyhteyttä.

## Asennus puhelimeen

**iPhone (Safari)**

1. Avaa sovelluksen osoite Safarissa.
2. Napauta Jaa-painiketta (neliö, josta nuoli osoittaa ylös).
3. Valitse "Lisää Koti-valikkoon" ja napauta "Lisää".

**Android (Chrome)**

1. Avaa sovelluksen osoite Chromessa.
2. Napauta oikean yläkulman kolmea pistettä.
3. Valitse "Asenna sovellus" tai "Lisää aloitusnäytölle" ja vahvista.

Valikkojen nimet voivat vaihdella hieman puhelimen ja selaimen version mukaan.

## Tietojen varmuuskopiointi

Tiedot tallentuvat vain omalle laitteellesi selaimen localStorageen. Ne eivät siirry palvelimelle,
eivätkä kaverisi näe niitä. Selaimen tietojen tyhjennys poistaa myös sovelluksen tiedot.

1. Avaa **Asetukset** (rataskuvake) ja napauta **Vie tiedot**. Laite lataa JSON-tiedoston.
2. Toisella laitteella avaa **Asetukset**, napauta **Tuo tiedot** ja valitse tiedosto.
3. Vahvista tuonti. Se korvaa kyseisen laitteen nykyiset tiedot.

## Kehittäjälle

Sovelluksessa ei ole build-vaihetta eikä riippuvuuksia. Paikallinen ajo:

```bash
npx serve .
```

| Tiedosto | Sisältö |
| --- | --- |
| `index.html` | Sivun runko |
| `styles.css` | Ulkoasu ja väriteemat |
| `app.js` | Sovelluslogiikka |
| `data.js` | Oletusruoat ja reseptilinkit |
| `sw.js` | Service worker (offline-käyttö) |
| `manifest.webmanifest`, `icons/` | PWA-asennuksen tiedot ja kuvakkeet |

Kaikki polut ovat suhteellisia, joten sovellus toimii myös alihakemistossa, kuten
`https://kayttaja.github.io/kasvisarki/`. Lisää uudet oletusruoat `data.js`-listan loppuun,
koska käyttäjien valinnat viittaavat ruoan paikkaan listassa. Jos muutat `sw.js`:n tiedostolistaa,
vaihda myös `CACHE`-version numero.

### Julkaisu GitHub Pagesiin

1. Luo GitHubissa julkinen repositorio nimeltä `kasvisarki` ja vie tiedostot sinne.
2. Avaa repositorion **Settings → Pages**.
3. Valitse **Source**-kohtaan **Deploy from a branch**, haaraksi `main` ja kansioksi `/ (root)`. Tallenna.
4. Sovellus aukeaa hetken kuluttua osoitteessa `https://KAYTTAJA.github.io/kasvisarki/`.

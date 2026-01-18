---
title: Jäsenrekisterin rekisteri- ja tietosuojaseloste
---

# Jäsenrekisterin rekisteri- ja tietosuojaseloste

Tämä on EU:n yleisen tietosuoja-asetuksen (GDPR) sekä yhdistyslain (503/1989) mukainen rekisteri- ja tietosuojaseloste.

**Laatimispäivämäärä:** 22.5.2018
**Viimeisin muutos:** 8.1.2026

---

## 1. Rekisterinpitäjä

**Tietokilta ry**
Y-tunnus: 1790346-8
Osoite: Konemiehentie 2, 02150 Espoo
Sähköposti: hallitus@tietokilta.fi

## 2. Yhteyshenkilö tietosuoja-asioissa

Tietosuoja-asioissa voit ottaa yhteyttä hallitukseen osoitteessa hallitus@tietokilta.fi

## 3. Rekisterin nimi

Tietokillan jäsenrekisteri

## 4. Oikeusperuste ja käsittelyn tarkoitus

**Oikeusperuste:**

- Jäsenyyssopimuksen täyttäminen (GDPR 6(1)(b))
- Lakisääteinen velvoite – yhdistyslaki (GDPR 6(1)(c))
- Oikeutettu etu jäsentoiminnan järjestämiseksi (GDPR 6(1)(f))
- Suostumus vapaaehtoisten markkinointiviestien osalta (GDPR 6(1)(a))

**Käsittelyn tarkoitus:**

- Jäsenyyksien ylläpito ja hallinta
- Jäsenmaksujen käsittely
- Viestintä jäsenille (tapahtumat, tiedotteet, jäsenedut)
- Yhdistyksen lakisääteisten velvoitteiden täyttäminen
- Tunnistautumispalveluiden tarjoaminen muihin killan sähköisiin palveluihin

## 5. Rekisterin tietosisältö

**Jäsenen perustiedot:**

- Etunimi ja sukunimi
- Sähköpostiosoite
- Kotikunta (yhdistyslain edellyttämä tieto)
- Ensisijainen kieli (valinnainen)

**Jäsenyystiedot:**

- Jäsenyyden tyyppi (varsinainen jäsen, alumnijäsen jne.), alkamis- ja päättymispäivä, tila
- Opiskelijastatus (itse ilmoitettu; voidaan vahvistaa Aalto-sähköpostilla)
- Maksuhistoria, Stripe-asiakastunnus

**Suostumukset:**

- Jäsenyyteen liittymättömien sähköpostien vastaanotto

**Avainkoodit (Passkeys):**

- Julkiset avaimet salasanattomaan kirjautumiseen
- Laitteen nimi, kuljetustavat, synkronointitila
- Viimeisimmän käyttökerran ajankohta

**Toissijaiset sähköpostiosoitteet (valinnainen):**

- Lisäsähköpostiosoitteet vaihtoehtoiseen kirjautumiseen
- Sähköpostin verkkotunnus (esim. aalto.fi)
- Vahvistuksen tila ja ajankohta
- Vanhenemispäivä verkkotunnusvarmennetuille sähköposteille

_Huom: Toissijaiset sähköpostit ovat täysin vapaaehtoisia, lukuun ottamatta aalto.fi-sähköpostin vahvistusta, joka vaaditaan tietyille jäsenyystyypeille (esim. opiskelijajäsenyys)._

**Tekniset tiedot:**

- Istuntotunnisteet, kirjautumiskoodit
- Tarkastusloki (audit log) hallinnollisista toimenpiteistä (90 pv)
- IP-osoitteet ja selaintiedot (user agent) kirjautumisyrityksistä (90 pv)
- Kuormituksenrajoitustiedot (rate limiting) (vain muistissa)

## 6. Säännönmukaiset tietolähteet

Henkilötiedot kerätään ensisijaisesti jäseneltä itseltään:

- Jäsenhakemus ja jäsenyyden ostaminen
- Jäsentietojen päivittäminen järjestelmässä
- Kirjautuminen järjestelmään

Lisäksi tietoja saadaan:

- Stripe-maksujärjestelmästä (maksutapahtumat)

## 7. Tietojen säilytysaika

Poistamme tietoja mahdollisimman pian, kun niitä ei enää tarvita.

**Keskeneräiset rekisteröitymiset:**

Henkilötietoja ei säilytetä käyttäjistä, jotka eivät suorita rekisteröitymistä loppuun. Kirjautumiskoodit vanhenevat automaattisesti 10 minuutissa.

**Tekniset tiedot:**

- Kirjautumiskoodit: 10 minuuttia
- Istuntotunnisteet: 30 päivää
- Avainkoodit: kunnes käyttäjä poistaa tai tili poistetaan
- Toissijaiset sähköpostit: kunnes käyttäjä poistaa tai tili poistetaan
- Aalto.fi-sähköpostin vahvistus: voimassa 6 kuukautta, jonka jälkeen vaaditaan uudelleenvahvistus
- IP-osoitteet, selaintiedot, tarkastusloki: 90 päivää
- Kuormituksenrajoitustiedot: vain muistissa

**Lakisääteiset säilytysvelvoitteet:**

- **Kirjanpitolaki:** Maksut, laskut ja tositteet vähintään 6 vuotta tilikauden päättymisestä
- **Yhdistyslaki:** Jäsentiedot säilytetään lakisääteisten velvoitteiden täyttämiseksi

**Käytännössä jäsenyyden päätyttyä:** Tekniset tiedot poistetaan automaattisesti niiden vanhennuttua. Jäsenrekisteritiedot ja kirjanpitotiedot säilytetään lakisääteisten velvoitteiden mukaisesti.

## 8. Tietojen luovutus ja siirrot

| Palveluntarjoaja | Sijainti      | Käyttötarkoitus        |
| ---------------- | ------------- | ---------------------- |
| Microsoft Azure  | EU (Irlanti)  | Tietokanta ja sovellus |
| Stripe           | EU            | Maksujenkäsittely      |
| Mailgun          | EU            | Sähköpostipalvelu      |
| Google Workspace | EU/Globaali\* | Postituslistat         |

_\*Google voi käsitellä tietoja EU:n ulkopuolella vakiolausekkein (SCCs)._

**Tietokillan muut palvelut:**

Rekisteriä voidaan käyttää jäsenen suostumuksella tunnistautumiseen muissa killan tarjoamissa sähköisissä palveluissa. Tällöin palvelulle luovutetaan vain välttämättömät tiedot (esim. nimi, sähköpostiosoite, jäsenyysstatus).

**Satunnaiset luovutukset:**

Tietoja voidaan luovuttaa viranomaisille lakisääteisen velvoitteen perusteella.

**Tietoturva siirroissa:**

Kaikki tiedonsiirrot tapahtuvat salattuja yhteyksiä (HTTPS/TLS) käyttäen. Tietoja ei myydä, vuokrata tai luovuteta markkinointitarkoituksiin.

## 9. Rekisterin suojaus

**Tekniset suojatoimet:**

- Tietokanta suojattu palomuurilla, pääsy rajattu valtuutetuille järjestelmille
- Kaikki tietoliikenne salattu (HTTPS/TLS)
- Ei salasanoja – sähköpostipohjainen kertakäyttökoodi ja avainkoodit
- Istuntotunnisteet tallennetaan hajautettuna (hashed)
- Tarkastusloki kaikista hallinnollisista toimenpiteistä
- Säännölliset automaattiset varmuuskopiot

**Organisatoriset suojatoimet:**

- Pääsy rajattu hallituksen avainhenkilöille (puheenjohtaja, sihteeri, rahastonhoitaja, kehittäjät)
- Käyttöoikeudet myönnetään vain tehtävän edellyttämässä laajuudessa
- Kaikki hallinnolliset toimenpiteet kirjataan tarkastuslokiin

**Fyysinen turvallisuus:**

Palvelimet sijaitsevat Microsoft Azure North Europe (Irlanti) -datakeskuksessa (ISO 27001, SOC 2).

## 10. Rekisteröidyn oikeudet

Rekisteröidyllä on oikeus:

- Tarkastaa itseään koskevat tiedot
- Vaatia tietojen oikaisemista
- Rajoittaa tai vastustaa käsittelyä
- Siirtää tiedot toiselle rekisterinpitäjälle
- Peruuttaa suostumuksensa
- Tehdä valitus tietosuojavaltuutetulle ([tietosuoja.fi](https://tietosuoja.fi))

**Huomautus tietojen poistamisesta:**

Yhdistyslaki (503/1989 § 11) edellyttää jäsenluettelon ylläpitoa. Tämä lakisääteinen velvoite menee GDPR:n poisto-oikeuden edelle.

## 11. Tarkastusoikeus ja oikaisu

**Tarkastusoikeus:**

Jäsen voi tarkastaa ja hallita omia tietojaan kirjautumalla järjestelmään. Tekniset tiedot (istunnot, lokit, IP-osoitteet) voi pyytää erikseen osoitteesta hallitus@tietokilta.fi.

**Oikeus tietojen korjaamiseen:**

Rekisteröity voi itse korjata ja päivittää tietojaan kirjautumalla järjestelmään. Mikäli tietoja ei voi korjata itse, voi pyytää tietojen korjaamista ottamalla yhteyttä osoitteeseen hallitus@tietokilta.fi.

**Valvontaviranomainen Suomessa:**

Tietosuojavaltuutetun toimisto
Käyntiosoite: Lintulahdenkuja 4, 00530 Helsinki
Postiosoite: PL 800, 00531 Helsinki
Puhelinvaihde: 029 56 66700
Sähköposti: tietosuoja@om.fi
Verkkosivu: [https://tietosuoja.fi](https://tietosuoja.fi)

## 12. Automaattinen päätöksenteko

Rekisterissä ei käytetä GDPR:n artiklan 22 mukaista automaattista päätöksentekoa tai profilointia. Kaikki jäsenyyttä koskevat päätökset (esim. jäsenhakemusten hyväksyminen) tekee ihminen.

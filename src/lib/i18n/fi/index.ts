import type { BaseTranslation } from "../i18n-types";

const fi = {
	// Application
	app: {
		title: "Tietokilta Jäsenrekisteri",
	},

	// Authentication
	auth: {
		signIn: "Kirjaudu sisään",
		signOut: "Kirjaudu ulos",
		email: "Sähköposti",
		code: "Koodi",
		verify: "Vahvista",
		codeSentTo: "Lähetimme 8-numeroisen koodin osoitteeseen {email}.",
		resendCode: "Lähetä uusi koodi",
		changeEmail: "Vaihda sähköpostiosoite",
		emailSubject: "Tietokillan jäsenrekisterin sisäänkirjautumiskoodi",
		emailBody: "Koodisi on {code}",

		// Passkey
		passkey: {
			signInWithPasskey: "Kirjaudu avainkoodilla",
			sendEmailCode: "Lähetä sähköpostikoodi",
			signingInAs: "Kirjaudutaan sisään:",
			useDifferentEmail: "Käytä toista sähköpostiosoitetta",
			or: "tai",
			authenticating: "Tunnistaudutaan...",
			authFailed: "Tunnistautuminen epäonnistui. Yritä uudelleen tai käytä sähköpostikoodia.",
			authCancelled: "Tunnistautuminen peruttiin",
			rateLimited: "Liian monta yritystä. Yritä myöhemmin uudelleen tai käytä sähköpostikoodia.",
			regFailed: "Avainkoodin rekisteröinti epäonnistui. Yritä myöhemmin uudelleen.",
			regCancelled: "Rekisteröinti peruttiin",
			regAlreadyRegistered:
				"Tämä laite on jo rekisteröity. Jos haluat rekisteröidä uudelleen, poista vanha avainkoodi ensin.",

			// Banner
			bannerTitle: "Lisää avainkoodi",
			bannerSetup: "Ota käyttöön",
			settingUp: "Otetaan käyttöön...",
			dismiss: "Sulje",

			// Management page
			title: "Avainkoodit",
			manageDescription: "Hallinnoi avainkoodeja nopeampaa kirjautumista varten",
			addPasskey: "Lisää avainkoodi",
			adding: "Lisätään...",
			noPasskeys: "Ei avainkoodeja",
			createdAt: "Luotu",
			lastUsedAt: "Viimeksi käytetty",
			never: "Ei koskaan",
			synced: "Synkronoitu",
			transports: "Kuljetustavat",
			deleteConfirm: "Haluatko varmasti poistaa tämän avainkoodin?",
			deletePasskey: "Poista avainkoodi",
			rename: "Nimeä uudelleen",
			deviceName: "Laitteen nimi",
			save: "Tallenna",
			saving: "Tallennetaan...",
			cancel: "Peruuta",
			continue: "Jatka",
			nameOptional: "Valinnainen - jätä tyhjäksi käyttääksesi päivämäärää",
			nameThisPasskey: "Nimeä tämä avainkoodi?",
			renameHint: "Voit nimetä avainkoodit uudelleen lisäämisen jälkeen",
		},
	},

	// User
	user: {
		welcome: "Tervetuloa {firstNames} {lastName}!",
		hi: "Hei, {email}!",
		editInfo: "Muokkaa tietojasi",
		email: "Sähköposti",
		firstNames: "Etunimet",
		lastName: "Sukunimi",
		homeMunicipality: "Kotikunta",
		preferredLanguage: "Ensisijainen kieli (valinnainen)",
		preferredLanguageDescription:
			"Kieli, jolla haluat vastaanottaa viestintää (esim. jäsenyyssähköpostit tai viikkotiedote)",
		preferredLanguageOptions: {
			unspecified: "Ei määritelty",
			finnish: "Suomi",
			english: "Englanti",
		},
		allowEmails: "Muut sähköpostit",
		allowEmailsDescription: "Saan sähköposteja myös muista kuin jäsenyyteen liittyvistä asioista (esim. viikkotiedote)",
		saveSuccess: "Tiedot tallennettu onnistuneesti",
		saveError: "Tietojen tallentaminen epäonnistui",
	},

	// Membership
	membership: {
		title: "Jäsenyydet",
		current: "Nykyiset jäsenyydet",
		createNew: "Luo uusi jäsenyys",
		buy: "Osta jäsenyys",
		select: "Valitse jäsenyys",
		type: "Tyyppi",
		continuityNote: "Jäsenyydet jatkuvat automaattisesti, jos ne ovat samaa tyyppiä",
		startTime: "Alkamisaika",
		endTime: "Päättymisaika",
		priceCents: "Hinta sentteinä",
		price: "Hinta {price}€",
		add: "Lisää jäsenyys",
		noMembership: "Ei jäsenyyttä",
		requiresStudentVerification: "Edellyttää opiskelijastatusta",
		isStudent: "Olen opiskelija Aalto-yliopistossa",

		// Status
		status: {
			active: "Voimassa oleva jäsenyys",
			expired: "Vanhentunut",
			awaitingPayment: "Odottaa maksua",
			awaitingApproval: "Odottaa hyväksyntää",
			unknown: "Tuntematon tila",
		},
	},

	// Admin
	admin: {
		title: "Hallintapaneeli",

		memberships: {
			title: "Hallinnoi jäsenyyksiä",
			description: "Muokkaa hintoja ja kausia",
			stripePriceId: "Stripe hintakoodi",
			stripePriceIdDescription: "Stripe-hallintapaneelin tuotekoodi (Price ID)",
			stripePriceIdLabel: "Hintakoodi {stripePriceId}",
		},

		members: {
			title: "Hallinnoi jäseniä",
			description: "Hallinnoi yksittäisiä jäseniä",
			listTitle: "Jäsenet",
			count: "{count} {{jäsen|jäsentä}}",
			homeMunicipality: "Kotikunta: {homeMunicipality}",
			membershipType: "Jäsenyyden tyyppi: {membershipType}",
			userId: "Käyttäjätunnus",
			userIdentifier: "Tunnus",

			// Table
			table: {
				search: "Hae jäseniä...",
				copyAsText: "Kopioi tekstinä",
				copied: "Kopioitu!",
				exportJasenet: "Vie jasenet@",
				exportAktiivit: "Vie aktiivit@",
				exported: "Viety!",
				filterYear: "Vuosi:",
				filterType: "Tyyppi:",
				filterStatus: "Tila:",
				filterEmailAllowed: "Sähköpostit:",
				emailAllowed: "Sallittu",
				emailNotAllowed: "Ei sallittu",
				all: "Kaikki",
				active: "Aktiivinen",
				expired: "Vanhentunut",
				awaitingApproval: "Odottaa hyväksyntää",
				awaitingPayment: "Odottaa maksua",
				cancelled: "Peruutettu",

				// Column headers
				firstNames: "Etunimet",
				lastName: "Sukunimi",
				email: "Sähköposti",
				membershipType: "Jäsenyyden tyyppi",
				status: "Tila",

				// Row details
				membershipsCount: "{count} {{jäsenyys|jäsenyyttä}}",
				userDetails: "Käyttäjän tiedot",
				userIdLabel: "Käyttäjätunnus:",
				emailLabel: "Sähköposti:",
				municipalityLabel: "Kotikunta:",
				preferredLanguageLabel: "Ensisijainen kieli:",
				emailAllowedLabel: "Sähköpostit sallittu:",
				yes: "Kyllä",
				no: "Ei",

				// Membership details
				memberships: "Jäsenyydet",
				membershipsOf: "{filtered} / {total} jäsenyyttä",
				typeLabel: "Tyyppi:",
				periodLabel: "Kausi:",
				priceLabel: "Hinta:",
				statusLabel: "Tila:",
				createdLabel: "Luotu:",
				stripeSessionLabel: "Stripe-istunto:",

				// Actions
				approve: "Hyväksy",
				reject: "Hylkää",
				reactivate: "Aktivoi uudelleen",
				markExpired: "Merkitse vanhentuneeksi",
				cancelMembership: "Peruuta jäsenyys",

				// Pagination
				showing: "Näytetään {current} / {total} jäsentä",
				previous: "Edellinen",
				next: "Seuraava",
			},
		},

		import: {
			title: "Tuo jäseniä",
			description: "Tuo jäseniä CSV-tiedostosta",
			step1: "1. Lataa CSV-tiedosto",
			step2: "2. Esikatselu ja tuonti",
			csvFile: "CSV-tiedosto",
			expectedColumns: "Odotetut sarakkeet:",
			existingMemberships: "Olemassa olevat jäsenyydet tietokannassa:",
			matchNote: "CSV-rivien tulee vastata näitä täsmälleen (tyyppi + alkamispäivä). Jäsenyyksiä EI luoda tuonnissa.",
			start: "Alku:",
			end: "Loppu:",
			validationErrors: "Vahvistusvirheet:",
			success: "Tuonti onnistui!",
			successCount: "Tuotiin {successCount} / {totalRows} {{jäsen|jäsentä}}",
			viewErrors: "Näytä {errorCount} {{virhe|virhettä}}",
			failed: "Tuonti epäonnistui",
			preview: "Tuonnin esikatselu",
			uniqueUsers: "Uniikkeja käyttäjiä (luotu tai päivitetty):",
			recordsToCreate: "Luotavia jäsentietueita:",
			willBeActive: "Merkitään aktiivisiksi:",
			willBeExpired: "Merkitään vanhentuneiksi:",
			note: "Huom: Olemassa olevien käyttäjien tiedot päivitetään. Päällekkäiset jäsentietueet (sama käyttäjä + jäsenyys) ohitetaan.",
			dataPreview: "CSV-datan esikatselu",
			firstNames: "Etunimet",
			lastName: "Sukunimi",
			municipality: "Kotikunta",
			email: "Sähköposti",
			membershipType: "Jäsenyyden tyyppi",
			startDate: "Alkamispäivä",
			showingRows: "Näytetään ensimmäiset 10 / {rowCount} riviä",
			noRows: "Ei tuotavia rivejä",
			uploadPrompt: "Lataa CSV-tiedosto esikatselua varten",
			importing: "Tuodaan...",
			importButton: "Tuo {count} {{jäsen|jäsentä}}",
		},
	},

	// Common
	common: {
		save: "Tallenna",
		delete: "Poista",
	},

	// Documents & Legal
	documents: {
		memberRegistryPrivacy: {
			title: "Jäsenrekisterin rekisteri- ja tietosuojaseloste",
			intro: `Tämä on EU:n yleisen tietosuoja-asetuksen (GDPR) sekä yhdistyslain (503/1989)
				mukainen rekisteri- ja tietosuojaseloste.`,
			createdDate: "Laatimispäivämäärä: 22.5.2018",
			lastUpdated: "Viimeisin muutos: 15.12.2025",

			section1Title: "1. Rekisterinpitäjä",
			section1Content: `
				<strong>Tietokilta ry</strong><br/>
				Y-tunnus: 1790346-8<br/>
				Osoite: Konemiehentie 2, 02150 Espoo<br/>
				Sähköposti: hallitus@tietokilta.fi
			`,

			section2Title: "2. Yhteyshenkilö tietosuoja-asioissa",
			section2Content: `
				Tietosuoja-asioissa voit ottaa yhteyttä hallitukseen osoitteessa hallitus@tietokilta.fi
			`,

			section3Title: "3. Rekisterin nimi",
			section3Content: `
				Tietokillan jäsenrekisteri
			`,

			section4Title: "4. Oikeusperuste ja käsittelyn tarkoitus",
			section4Content: `
				<strong>Oikeusperuste:</strong><br/>
				<ul>
					<li>Jäsenyyssopimuksen täyttäminen (GDPR 6(1)(b))</li>
					<li>Lakisääteinen velvoite – yhdistyslaki (GDPR 6(1)(c))</li>
					<li>Oikeutettu etu jäsentoiminnan järjestämiseksi (GDPR 6(1)(f))</li>
					<li>Suostumus vapaaehtoisten markkinointiviestien osalta (GDPR 6(1)(a))</li>
				</ul><br/>

				<strong>Käsittelyn tarkoitus:</strong><br/>
				<ul>
					<li>Jäsenyyksien ylläpito ja hallinta</li>
					<li>Jäsenmaksujen käsittely</li>
					<li>Viestintä jäsenille (tapahtumat, tiedotteet, jäsenedut)</li>
					<li>Yhdistyksen lakisääteisten velvoitteiden täyttäminen</li>
					<li>Tunnistautumispalveluiden tarjoaminen muihin killan sähköisiin palveluihin</li>
				</ul>
			`,

			section5Title: "5. Rekisterin tietosisältö",
			section5Content: `
				<strong>Jäsenen perustiedot:</strong><br/>
				<ul>
					<li>Etunimi ja sukunimi</li>
					<li>Sähköpostiosoite</li>
					<li>Kotikunta (yhdistyslain edellyttämä tieto)</li>
					<li>Ensisijainen kieli (valinnainen)</li>
				</ul><br/>

				<strong>Jäsenyystiedot:</strong><br/>
				<ul>
					<li>Jäsenyyden tyyppi (varsinainen jäsen, alumnijäsen jne.), alkamis- ja päättymispäivä, tila</li>
					<li>Opiskelijastatus (itse ilmoitettu; voidaan vahvistaa Aalto-sähköpostilla)</li>
					<li>Maksuhistoria, Stripe-asiakastunnus</li>
				</ul><br/>

				<strong>Suostumukset:</strong><br/>
				<ul>
					<li>Jäsenyyteen liittymättömien sähköpostien vastaanotto</li>
				</ul><br/>

				<strong>Avainkoodit (Passkeys):</strong><br/>
				<ul>
					<li>Julkiset avaimet salasanattomaan kirjautumiseen</li>
					<li>Laitteen nimi, kuljetustavat, synkronointitila</li>
					<li>Viimeisimmän käyttökerran ajankohta</li>
				</ul><br/>

				<strong>Tekniset tiedot:</strong><br/>
				<ul>
					<li>Istuntotunnisteet, kirjautumiskoodit</li>
					<li>Tarkastusloki (audit log) hallinnollisista toimenpiteistä (90 pv)</li>
					<li>IP-osoitteet ja selaintiedot (user agent) kirjautumisyrityksistä (90 pv)</li>
					<li>Kuormituksenrajoitustiedot (rate limiting) (vain muistissa)</li>
				</ul>
			`,

			section6Title: "6. Säännönmukaiset tietolähteet",
			section6Content: `
				Henkilötiedot kerätään ensisijaisesti jäseneltä itseltään:<br/>
				<ul>
					<li>Jäsenhakemus ja jäsenyyden ostaminen</li>
					<li>Jäsentietojen päivittäminen järjestelmässä</li>
					<li>Kirjautuminen järjestelmään</li>
				</ul><br/>

				Lisäksi tietoja saadaan:<br/>
				<ul>
					<li>Stripe-maksujärjestelmästä (maksutapahtumat)</li>
				</ul>
			`,

			section7Title: "7. Tietojen säilytysaika",
			section7Content: `
				Poistamme tietoja mahdollisimman pian, kun niitä ei enää tarvita.<br/><br/>

				<strong>Keskeneräiset rekisteröitymiset:</strong><br/>
				Henkilötietoja ei säilytetä käyttäjistä, jotka eivät suorita rekisteröitymistä loppuun.
				Kirjautumiskoodit vanhenevat automaattisesti 10 minuutissa.<br/><br/>

				<strong>Tekniset tiedot:</strong><br/>
				<ul>
					<li>Kirjautumiskoodit: 10 minuuttia</li>
					<li>Istuntotunnisteet: 30 päivää</li>
					<li>Avainkoodit: kunnes käyttäjä poistaa tai tili poistetaan</li>
					<li>IP-osoitteet, selaintiedot, tarkastusloki: 90 päivää</li>
					<li>Kuormituksenrajoitustiedot: vain muistissa</li>
				</ul><br/>

				<strong>Lakisääteiset säilytysvelvoitteet:</strong><br/>
				<ul>
					<li><strong>Kirjanpitolaki:</strong> Maksut, laskut ja tositteet vähintään 6 vuotta tilikauden päättymisestä</li>
					<li><strong>Yhdistyslaki:</strong> Jäsentiedot säilytetään lakisääteisten velvoitteiden täyttämiseksi</li>
				</ul><br/>

				<strong>Käytännössä jäsenyyden päätyttyä:</strong> Tekniset tiedot poistetaan automaattisesti niiden
				vanhennuttua. Jäsenrekisteritiedot ja kirjanpitotiedot säilytetään lakisääteisten velvoitteiden mukaisesti.
			`,

			section8Title: "8. Tietojen luovutus ja siirrot",
			section8Content: `
				<table>
					<thead>
						<tr>
							<th>Palveluntarjoaja</th>
							<th>Sijainti</th>
							<th>Käyttötarkoitus</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Microsoft Azure</td>
							<td>EU (Irlanti)</td>
							<td>Tietokanta ja sovellus</td>
						</tr>
						<tr>
							<td>Stripe</td>
							<td>EU</td>
							<td>Maksujenkäsittely</td>
						</tr>
						<tr>
							<td>Mailgun</td>
							<td>EU</td>
							<td>Sähköpostipalvelu</td>
						</tr>
						<tr>
							<td>Google Workspace</td>
							<td>EU/Globaali*</td>
							<td>Postituslistat</td>
						</tr>
					</tbody>
				</table>
				<p class="text-sm">*Google voi käsitellä tietoja EU:n ulkopuolella vakiolausekkein (SCCs).</p><br/>

				<strong>Tietokillan muut palvelut:</strong><br/>
				Rekisteriä voidaan käyttää jäsenen suostumuksella tunnistautumiseen muissa killan
				tarjoamissa sähköisissä palveluissa. Tällöin palvelulle luovutetaan vain välttämättömät
				tiedot (esim. nimi, sähköpostiosoite, jäsenyysstatus).<br/><br/>

				<strong>Satunnaiset luovutukset:</strong><br/>
				Tietoja voidaan luovuttaa viranomaisille lakisääteisen velvoitteen perusteella.<br/><br/>

				<strong>Tietoturva siirroissa:</strong><br/>
				Kaikki tiedonsiirrot tapahtuvat salattuja yhteyksiä (HTTPS/TLS) käyttäen.
				Tietoja ei myydä, vuokrata tai luovuteta markkinointitarkoituksiin.
			`,

			section9Title: "9. Rekisterin suojaus",
			section9Content: `
				<strong>Tekniset suojatoimet:</strong><br/>
				<ul>
					<li>Tietokanta suojattu palomuurilla, pääsy rajattu valtuutetuille järjestelmille</li>
					<li>Kaikki tietoliikenne salattu (HTTPS/TLS)</li>
					<li>Ei salasanoja – sähköpostipohjainen kertakäyttökoodi ja avainkoodit</li>
					<li>Istuntotunnisteet tallennetaan hajautettuna (hashed)</li>
					<li>Tarkastusloki kaikista hallinnollisista toimenpiteistä</li>
					<li>Säännölliset automaattiset varmuuskopiot</li>
				</ul><br/>

				<strong>Organisatoriset suojatoimet:</strong><br/>
				<ul>
					<li>Pääsy rajattu hallituksen avainhenkilöille (puheenjohtaja, sihteeri, rahastonhoitaja, kehittäjät)</li>
					<li>Käyttöoikeudet myönnetään vain tehtävän edellyttämässä laajuudessa</li>
					<li>Kaikki hallinnolliset toimenpiteet kirjataan tarkastuslokiin</li>
				</ul><br/>

				<strong>Fyysinen turvallisuus:</strong><br/>
				Palvelimet sijaitsevat Microsoft Azure North Europe (Irlanti) -datakeskuksessa (ISO 27001, SOC 2).
			`,

			section10Title: "10. Rekisteröidyn oikeudet",
			section10Content: `
				Rekisteröidyllä on oikeus:<br/>
				<ul>
					<li>Tarkastaa itseään koskevat tiedot</li>
					<li>Vaatia tietojen oikaisemista</li>
					<li>Rajoittaa tai vastustaa käsittelyä</li>
					<li>Siirtää tiedot toiselle rekisterinpitäjälle</li>
					<li>Peruuttaa suostumuksensa</li>
					<li>Tehdä valitus tietosuojavaltuutetulle (<a href="https://tietosuoja.fi" target="_blank" rel="noopener noreferrer">tietosuoja.fi</a>)</li>
				</ul><br/>

				<strong>⚠️ Huomautus tietojen poistamisesta:</strong><br/>
				Yhdistyslaki (503/1989 § 11) edellyttää jäsenluettelon ylläpitoa.
				Tämä lakisääteinen velvoite menee GDPR:n poisto-oikeuden edelle.
			`,

			section11Title: "11. Tarkastusoikeus ja oikaisu",
			section11Content: `
				<strong>Tarkastusoikeus:</strong><br/>
				Jäsen voi tarkastaa ja hallita omia tietojaan kirjautumalla järjestelmään.
				Tekniset tiedot (istunnot, lokit, IP-osoitteet) voi pyytää erikseen osoitteesta
				hallitus@tietokilta.fi.<br/><br/>

				<strong>Oikeus tietojen korjaamiseen:</strong><br/>
				Rekisteröity voi itse korjata ja päivittää tietojaan kirjautumalla järjestelmään.
				Mikäli tietoja ei voi korjata itse, voi pyytää tietojen korjaamista ottamalla yhteyttä
				osoitteeseen hallitus@tietokilta.fi.<br/><br/>

				<strong>Valvontaviranomainen Suomessa:</strong><br/>
				Tietosuojavaltuutetun toimisto<br/>
				Käyntiosoite: Lintulahdenkuja 4, 00530 Helsinki<br/>
				Postiosoite: PL 800, 00531 Helsinki<br/>
				Puhelinvaihde: 029 56 66700<br/>
				Sähköposti: tietosuoja@om.fi<br/>
				Verkkosivu: <a href="https://tietosuoja.fi" target="_blank" rel="noopener noreferrer">https://tietosuoja.fi</a>
			`,

			section12Title: "12. Automaattinen päätöksenteko",
			section12Content: `
				Rekisterissä ei käytetä GDPR:n artiklan 22 mukaista automaattista päätöksentekoa tai profilointia.
				Kaikki jäsenyyttä koskevat päätökset (esim. jäsenhakemusten hyväksyminen) tekee ihminen.
			`,
		},

		footer: {
			version: "Versio",
			privacyPolicy: "Rekisteri- ja tietosuojaseloste",
			organization: "Tietokilta ry",
			businessId: "Y-tunnus: 1790346-8",
			contact: "Yhteystiedot",
			email: "hallitus@tietokilta.fi",
			address: "Konemiehentie 2, 02150 Espoo",
		},
	},
} satisfies BaseTranslation;

export default fi;

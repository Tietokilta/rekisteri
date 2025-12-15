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
		privacyPolicy: {
			title: "Tietosuojaseloste",
			lastUpdated: "Viimeksi päivitetty: 15.12.2025",

			section1Title: "1. Rekisterinpitäjä",
			section1Content: `
				<strong>Tietokilta ry</strong><br/>
				Y-tunnus: 1790346-8<br/>
				Osoite: Konemiehentie 2, 02150 Espoo<br/>
				Sähköposti: hallitus@tietokilta.fi<br/>
			`,

			section2Title: "2. Yhteyshenkilö tietosuoja-asioissa",
			section2Content: `
				Tietosuoja-asioissa voit ottaa yhteyttä hallitukseen osoitteessa hallitus@tietokilta.fi
			`,

			section3Title: "3. Rekisterin nimi",
			section3Content: `
				Tietokillan jäsenrekisteri
			`,

			section4Title: "4. Henkilötietojen käsittelyn tarkoitus ja oikeusperuste",
			section4Content: `
				<strong>Käsittelyn tarkoitus:</strong> Jäsenyyksien hallinta, jäsenpalveluiden tarjoaminen,
				viestintä jäsenille sekä yhdistyksen lakisääteisten velvoitteiden täyttäminen.<br/><br/>

				<strong>Oikeusperuste:</strong> Jäsenyyssopimuksen täyttäminen (GDPR 6(1)(b)),
				oikeutettu etu jäsentoiminnan järjestämiseksi (GDPR 6(1)(f)) sekä
				suostumus vapaaehtoisten markkinointiviestien osalta (GDPR 6(1)(a)).
			`,

			section5Title: "5. Rekisterin tietosisältö",
			section5Content: `
				Rekisteriin tallennetaan seuraavat tiedot:<br/><br/>

				<ul>
					<li><strong>Perustiedot:</strong> Etunimi, sukunimi, sähköpostiosoite</li>
					<li><strong>Jäsenyyteen liittyvät tiedot:</strong> Jäsenyyden tyyppi, voimassaoloaika, maksuhistoria, jäsenyyden tila, Stripe-asiakastunnus</li>
					<li><strong>Opiskelijastatus:</strong> Tieto siitä, onko jäsen opiskelija. Tieto on tällä hetkellä itse ilmoitettu; tulevaisuudessa status on tarkoitus vahvistaa Aalto-yliopiston sähköpostiosoitteen avulla.</li>
					<li><strong>Kotikunta:</strong> Käytetään tilastointitarkoituksiin</li>
					<li><strong>Suostumukset:</strong> Tieto siitä, saako yhdistys lähettää jäsenyyteen liittymättömiä sähköposteja</li>
					<li><strong>Avainkoodit (Passkeys):</strong> Salasanattomaan kirjautumiseen käytettävät julkiset avaimet, laitteen nimi, kuljetustavat, synkronointitila (esim. iCloud-avainnippu) ja viimeisimmän käyttökerran ajankohta</li>
					<li><strong>Tekniset tiedot:</strong> Istuntotunnisteet, kirjautumiskoodit, tarkastusloki (audit log) hallinnollisista toimenpiteistä (säilytetään 90 päivää), IP-osoitteet ja selaintiedot (user agent) kirjautumisyrityksistä ja hallinnollisista toimenpiteistä (väärinkäytön ja hyökkäysten valvontaa varten, säilytetään 90 päivää), kuormituksenrajoitustiedot (rate limiting) (vain muistissa)</li>
				</ul>
			`,

			section6Title: "6. Säännönmukaiset tietolähteet",
			section6Content: `
				Tiedot saadaan jäseneltä itseltään jäsenhakemuksen yhteydessä tai jäsenen päivittäessä omia tietojaan järjestelmässä.
				Maksuun liittyvät tiedot saadaan Stripe-maksujärjestelmästä.<br/><br/>

				<strong>Opiskelijastatus:</strong> Tieto on tällä hetkellä itse ilmoitettu. Tulevaisuudessa status on tarkoitus
				vahvistaa Aalto-yliopiston sähköpostiosoitteen avulla. Järjestelmällä ei ole integraatiota Aalto-yliopiston
				tietojärjestelmiin.
			`,

			section7Title: "7. Tietojen säilytysaika",
			section7Content: `
				Poistamme tietoja mahdollisimman pian, kun niitä ei enää tarvita. Säilytysajat määräytyvät seuraavasti:<br/><br/>

				<strong>Keskeneräiset rekisteröitymiset:</strong><br/>
				Henkilötietoja ei säilytetä käyttäjistä, jotka eivät suorita rekisteröitymistä loppuun.
				Kirjautumiskoodit vanhenevat automaattisesti 10 minuutissa.<br/><br/>

				<strong>Tekniset tiedot:</strong><br/>
				<ul>
					<li>Kirjautumiskoodit: vanhenevat automaattisesti 10 minuutissa</li>
					<li>Istuntotunnisteet: vanhenevat automaattisesti 30 päivässä</li>
					<li>Avainkoodit: säilytetään kunnes käyttäjä poistaa ne tai käyttäjätili poistetaan</li>
					<li>IP-osoitteet ja selaintiedot: poistetaan 90 päivän kuluttua</li>
					<li>Tarkastusloki (audit log): poistetaan 90 päivän kuluttua</li>
					<li>Kuormituksenrajoitustiedot (rate limiting): vain muistissa, ei pysyvää tallennusta</li>
				</ul><br/>

				<strong>Jäsenrekisteritiedot (lakisääteiset säilytysvelvoitteet):</strong><br/>
				<ul>
					<li><strong>Kirjanpitolain mukaiset tiedot</strong> (maksut, laskut, tositteet): vähintään 6 vuotta
					tilikauden päättymisestä. Laki edellyttää näiden tietojen säilyttämistä.</li>
					<li><strong>Yhdistyslain mukaiset jäsenrekisteritiedot:</strong> säilytetään lakisääteisten velvoitteiden
					täyttämiseksi, jonka jälkeen anonymisoidaan tai poistetaan</li>
					<li><strong>Tilastotiedot:</strong> voidaan anonymisoida ja säilyttää historiallisiin tarkoituksiin</li>
				</ul><br/>

				<strong>Käytännössä jäsenyyden päätyttyä:</strong> Tekniset tiedot (istunnot, lokit)
				poistetaan automaattisesti niiden vanhennuttua. Jäsenrekisteritiedot ja kirjanpitotiedot säilytetään
				lakisääteisten velvoitteiden mukaisesti, jonka jälkeen ne poistetaan tai anonymisoidaan.
			`,

			section8Title: "8. Tietojen luovutus ja siirrot",
			section8Content: `
				<strong>Tietojen vastaanottajat:</strong><br/><br/>

				<ul>
					<li><strong>Microsoft Azure (North Europe, Irlanti):</strong> Pilvipalvelu, jossa rekisterin
					tietokanta (Azure Database for PostgreSQL) ja sovelluspalvelin (Azure App Service) sijaitsevat.
					Kaikki data säilytetään EU-alueella.</li>

					<li><strong>Stripe (EU-infrastruktuuri):</strong> Maksujenkäsittelypalvelu jäsenmaksujen käsittelyyn.
					Kaikki maksukorttitiedot käsittelee Stripe; itse tallennamme vain Stripe-asiakastunnuksen ja
					jäsenen sähköpostiosoitteen maksutapahtumia varten.</li>

					<li><strong>Mailgun (EU-endpoint):</strong> Sähköpostipalvelu (api.eu.mailgun.net) viestinnän
					lähettämiseen osoitteesta rekisteri.tietokilta.fi. Data käsitellään EU-alueella.</li>

					<li><strong>Google Workspace (Google Groups):</strong> Jäsenten sähköpostiosoitteita käytetään
					killan postituslistoilla (Google Groups) jäsenviestintää varten (tapahtumat, tiedotteet,
					jäsenedut). Tämä on välttämätöntä tehokkaalle jäsenviestinnälle. Google voi käsitellä tietoja
					EU:n ja ETA:n ulkopuolella; näissä tilanteissa Google käyttää EU-komission hyväksymiä
					vakiolausekkeita ja muita asianmukaisia suojausmekanismeja GDPR-vaatimusten noudattamiseksi.</li>
				</ul>
				<br/>

				<strong>Tietojen siirrot EU:n ulkopuolelle:</strong><br/>
				Pääsääntöisesti kaikki data säilytetään EU-alueella (Azure North Europe, Stripe EU, Mailgun EU).
				Google Workspace voi kuitenkin käsitellä postituslistoihin liittyviä sähköpostiosoitteita EU:n
				ulkopuolella käyttäen asianmukaisia suojausmekanismeja (vakiolausekkeet).<br/><br/>

				Tietoja ei myydä, vuokrata tai luovuteta kolmansille osapuolille markkinointitarkoituksiin.
			`,

			section9Title: "9. Automaattinen päätöksenteko",
			section9Content: `
				Rekisterissä ei käytetä GDPR:n artiklan 22 mukaista automaattista päätöksentekoa tai profilointia.
				Kaikki jäsenyyttä koskevat päätökset (esim. jäsenhakemusten hyväksyminen) tekee ihminen.
			`,
		},

		registryDisclosure: {
			title: "Rekisteriseloste",
			lastUpdated: "Viimeksi päivitetty: 15.12.2025",

			section1Title: "1. Rekisterinpitäjä",
			section1Content: `
				<strong>Tietokilta ry</strong><br/>
				Y-tunnus: 1790346-8<br/>
				Osoite: Konemiehentie 2, 02150 Espoo<br/>
				Sähköposti: hallitus@tietokilta.fi<br/>
			`,

			section2Title: "2. Rekisterin nimi",
			section2Content: `
				Tietokillan jäsenrekisteri
			`,

			section3Title: "3. Henkilötietojen käsittelyn tarkoitus",
			section3Content: `
				Rekisteriä käytetään seuraaviin tarkoituksiin:<br/><br/>

				<ul>
					<li>Jäsenyyksien ylläpito ja hallinta</li>
					<li>Jäsenmaksujen käsittely</li>
					<li>Viestintä jäsenille (tapahtumat, tiedotteet, jäsenedut)</li>
					<li>Yhdistyksen lakisääteisten velvoitteiden täyttäminen</li>
					<li>Tilastointi ja toiminnan kehittäminen</li>
				</ul>
			`,

			section4Title: "4. Rekisterin tietosisältö",
			section4Content: `
				<strong>Jäsenen perustiedot:</strong><br/>
				<ul>
					<li>Etunimi ja sukunimi</li>
					<li>Sähköpostiosoite</li>
					<li>Kotikunta</li>
				</ul><br/>

				<strong>Jäsenyystiedot:</strong><br/>
				<ul>
					<li>Jäsenyyden tyyppi (varsinainen jäsen, alumnijäsen jne.)</li>
					<li>Jäsenyyden alkamis- ja päättymispäivä</li>
					<li>Jäsenyyden tila (aktiivinen, vanhentunut, odottaa hyväksyntää jne.)</li>
					<li>Opiskelijastatus (tieto on tällä hetkellä itse ilmoitettu; tulevaisuudessa vahvistetaan Aalto-yliopiston sähköpostiosoitteella)</li>
					<li>Maksuhistoria ja maksutiedot</li>
					<li>Stripe-asiakastunnus</li>
				</ul><br/>

				<strong>Suostumukset:</strong><br/>
				<ul>
					<li>Jäsenyyteen liittymättömien sähköpostien vastaanotto</li>
				</ul><br/>

				<strong>Avainkoodit (Passkeys):</strong><br/>
				<ul>
					<li>Julkiset avaimet salasanattomaan kirjautumiseen</li>
					<li>Laitteen nimi (käyttäjän antama)</li>
					<li>Avainkoodin kuljetustavat (esim. USB, NFC, Bluetooth)</li>
					<li>Synkronointitila (esim. varmuuskopioitu iCloud-avainnippuun)</li>
					<li>Viimeisimmän käyttökerran ajankohta</li>
					<li>Luomis- ja päivitysajankohdat</li>
				</ul><br/>

				<strong>Tekniset tiedot:</strong><br/>
				<ul>
					<li>Istuntotunnisteet kirjautumista varten</li>
					<li>Kirjautumiskoodit ja niiden voimassaoloajat</li>
					<li>Tarkastusloki (audit log) hallinnollisista toimenpiteistä (säilytetään 90 päivää)</li>
					<li>IP-osoitteet kirjautumisyrityksistä ja hallinnollisista toimenpiteistä (säilytetään 90 päivää)</li>
					<li>Selaintiedot (user agent) kirjautumisyrityksistä ja hallinnollisista toimenpiteistä (säilytetään 90 päivää)</li>
					<li>Kuormituksenrajoitustiedot (rate limiting) ylikuormituksen estämiseksi (vain muistissa)</li>
					<li>Luomis- ja päivitysajankohdat</li>
				</ul>
			`,

			section5Title: "5. Säännönmukaiset tietolähteet",
			section5Content: `
				Henkilötiedot kerätään ensisijaisesti jäseneltä itseltään seuraavissa tilanteissa:<br/><br/>

				<ul>
					<li>Jäsenhakemus ja jäsenyyden ostaminen</li>
					<li>Jäsentietojen päivittäminen järjestelmässä</li>
					<li>Kirjautuminen järjestelmään</li>
				</ul><br/>

				Lisäksi tietoja voidaan saada:<br/>
				<ul>
					<li>Stripe-maksujärjestelmästä (maksutapahtumat, maksutiedot)</li>
					<li>Hallituksen jäsenrekisteristä massatuonnin yhteydessä (esim. aiempien vuosien jäsenet)</li>
				</ul><br/>

				<strong>Opiskelijastatus:</strong> Tieto on tällä hetkellä itse ilmoitettu. Tulevaisuudessa status on
				tarkoitus vahvistaa Aalto-yliopiston sähköpostiosoitteen avulla. Järjestelmällä ei ole integraatiota
				Aalto-yliopiston tietojärjestelmiin.
			`,

			section6Title: "6. Tietojen säilytysaika",
			section6Content: `
				Poistamme tietoja mahdollisimman pian, kun niitä ei enää tarvita. Säilytysajat määräytyvät seuraavasti:<br/><br/>

				<strong>Keskeneräiset rekisteröitymiset:</strong><br/>
				Henkilötietoja ei säilytetä käyttäjistä, jotka eivät suorita rekisteröitymistä loppuun.
				Kirjautumiskoodit vanhenevat automaattisesti 10 minuutissa.<br/><br/>

				<strong>Tekniset tiedot:</strong><br/>
				<ul>
					<li>Kirjautumiskoodit: vanhenevat automaattisesti 10 minuutissa</li>
					<li>Istuntotunnisteet: vanhenevat automaattisesti 30 päivässä</li>
					<li>Avainkoodit: säilytetään kunnes käyttäjä poistaa ne tai käyttäjätili poistetaan</li>
					<li>IP-osoitteet ja selaintiedot: poistetaan 90 päivän kuluttua</li>
					<li>Tarkastusloki (audit log): poistetaan 90 päivän kuluttua</li>
					<li>Kuormituksenrajoitustiedot (rate limiting): vain muistissa, ei pysyvää tallennusta</li>
				</ul><br/>

				<strong>Jäsenrekisteritiedot (lakisääteiset säilytysvelvoitteet):</strong><br/>
				<ul>
					<li><strong>Kirjanpitolain mukaiset tiedot</strong> (maksut, laskut, tositteet): vähintään 6 vuotta
					tilikauden päättymisestä. Laki edellyttää näiden tietojen säilyttämistä.</li>
					<li><strong>Yhdistyslain mukaiset jäsentiedot:</strong> säilytetään lakisääteisten velvoitteiden
					täyttämiseksi, jonka jälkeen anonymisoidaan tai poistetaan</li>
					<li><strong>Tilastotiedot:</strong> voidaan anonymisoida ja säilyttää historiallisiin tarkoituksiin</li>
				</ul><br/>

				<strong>Käytännössä jäsenyyden päätyttyä:</strong> Tekniset tiedot (istunnot, lokit)
				poistetaan automaattisesti niiden vanhennuttua. Jäsenrekisteritiedot ja kirjanpitotiedot säilytetään
				lakisääteisten velvoitteiden mukaisesti, jonka jälkeen ne poistetaan tai anonymisoidaan.
			`,

			section7Title: "7. Tietojen luovutus ja siirrot",
			section7Content: `
				<strong>Säännönmukaiset luovutukset:</strong><br/><br/>

				<ul>
					<li><strong>Microsoft Azure (North Europe, Irlanti):</strong> Pilvipalvelu, jossa rekisterin
					tietokanta (Azure Database for PostgreSQL) ja sovelluspalvelin (Azure App Service) sijaitsevat.
					Kaikki data säilytetään EU-alueella. Microsoft noudattaa GDPR-vaatimuksia.</li>

					<li><strong>Stripe Inc. (EU-infrastruktuuri):</strong> Maksujenkäsittelypalvelu. Tiedot siirretään
					turvallisesti Stripen EU-järjestelmiin maksujen käsittelyä varten. Kaikki maksukorttitiedot
					käsittelee Stripe; itse tallennamme vain Stripe-asiakastunnuksen ja sähköpostiosoitteen.
					Stripe noudattaa GDPR-vaatimuksia ja käyttää EU-komission hyväksymiä vakiolausekkeita.</li>

					<li><strong>Mailgun (Sinch MessageMedia Pty Ltd, EU-endpoint):</strong> Sähköpostipalvelu
					viestinnän lähettämiseen (api.eu.mailgun.net). Palvelu käsittelee sähköpostiosoitteita ja
					viestin sisältöä EU-alueella.</li>

					<li><strong>Google Workspace (Google Groups):</strong> Jäsenten sähköpostiosoitteita käytetään
					killan postituslistoilla (Google Groups) jäsenviestintää varten (tapahtumat, tiedotteet,
					jäsenedut). Tämä on välttämätöntä tehokkaalle jäsenviestinnälle. Google voi käsitellä tietoja
					EU:n ja ETA:n ulkopuolella; näissä tilanteissa Google käyttää EU-komission hyväksymiä
					vakiolausekkeita ja muita asianmukaisia suojausmekanismeja GDPR-vaatimusten noudattamiseksi.</li>
				</ul><br/>

				<strong>Satunnaiset luovutukset:</strong><br/>
				Tietoja voidaan luovuttaa viranomaisille lakisääteisen velvoitteen perusteella.<br/><br/>

				<strong>Tietojen siirrot EU:n ulkopuolelle:</strong><br/>
				Pääsääntöisesti kaikki data säilytetään EU-alueella (Azure North Europe, Stripe EU, Mailgun EU).
				Google Workspace voi kuitenkin käsitellä postituslistoihin liittyviä sähköpostiosoitteita EU:n
				ulkopuolella käyttäen asianmukaisia suojausmekanismeja (vakiolausekkeet).<br/><br/>

				<strong>Tietoturva siirroissa:</strong><br/>
				Kaikki tiedonsiirrot tapahtuvat salattuja yhteyksiä (HTTPS/TLS) käyttäen.
				Tietoja ei myydä, vuokrata tai luovuteta markkinointitarkoituksiin.
			`,

			section8Title: "8. Rekisterin suojauksen periaatteet",
			section8Content: `
				<strong>Tekniset suojatoimet:</strong><br/><br/>

				<ul>
					<li>Tietokanta (Azure Database for PostgreSQL) on suojattu palomuurilla ja pääsy on rajattu
					vain valtuutetuille järjestelmille</li>
					<li>Kaikki tietoliikenne tapahtuu salattua HTTPS/TLS-yhteyttä käyttäen</li>
					<li>Salasanoja ei tallenneta - käytetään sähköpostipohjaista kertakäyttökoodi-autentikointia</li>
					<li>Istuntotunnisteet tallennetaan hajautettuna (hashed)</li>
					<li>Järjestelmässä käytetään turvallista session-hallintaa (vanheneminen 30 päivässä)</li>
					<li>Tarkastusloki (audit log) kaikista hallinnollisista toimenpiteistä (säilytetään 90 päivää)</li>
					<li>Säännölliset automaattiset varmuuskopiot Azure-infrastruktuurissa</li>
				</ul><br/>

				<strong>Organisatoriset suojatoimet:</strong><br/><br/>

				<ul>
					<li>Pääsy rekisteriin on rajattu hallituksen avainhenkilöille: puheenjohtaja, varapuheenjohtaja/sihteeri,
					rahastonhoitaja, sekä aktiivisesti kehittävät ohjelmoijat</li>
					<li>Pääsy voidaan myöntää tarvittaessa muille hallituksen jäsenille esim. kokouksissa
					läsnäolon tarkistamiseen</li>
					<li>Käyttöoikeudet myönnetään vain tehtävän edellyttämässä laajuudessa</li>
					<li>Kaikki hallinnolliset toimenpiteet kirjataan tarkastuslokiin</li>
					<li>Hallituksen jäsenet on sitoutettu salassapitoon</li>
				</ul><br/>

				<strong>Fyysinen turvallisuus:</strong><br/>
				Palvelimet sijaitsevat Microsoft Azure North Europe (Irlanti) -datakeskuksessa, joka täyttää
				korkeat turvallisuusvaatimukset (ISO 27001, SOC 2, jne.).
			`,

			section9Title: "9. Tarkastusoikeus ja oikeus vaatia tiedon korjaamista",
			section9Content: `
				<strong>Tarkastusoikeus:</strong><br/>
				Jokaisella rekisteröidyllä on oikeus tarkistaa, mitä häntä koskevia tietoja
				henkilötietorekisteriin on talletettu. Tarkastuspyyntö tulee lähettää kirjallisesti
				osoitteeseen hallitus@tietokilta.fi.<br/><br/>

				<strong>Oikeus tietojen korjaamiseen:</strong><br/>
				Rekisteröity voi itse korjata ja päivittää tietojaan kirjautumalla järjestelmään.
				Mikäli tietoja ei voi korjata itse, voi pyytää tietojen korjaamista ottamalla yhteyttä
				osoitteeseen hallitus@tietokilta.fi.<br/><br/>

				<strong>Oikeus tietojen poistamiseen:</strong><br/>
				Rekisteröidyllä on oikeus pyytää tietojensa poistamista ("oikeus tulla unohdetuksi"),
				ellei tietojen säilyttämiseen ole lakisääteistä perustetta (esim. kirjanpitovelvoite).
			`,

			section10Title: "10. Muut henkilötietojen käsittelyyn liittyvät oikeudet",
			section10Content: `
				Rekisteröidyllä on oikeus:<br/><br/>

				<ul>
					<li><strong>Pyytää tietojensa käsittelyn rajoittamista</strong> tietyissä tilanteissa
					(esim. kun käsittelyn lainmukaisuus on kiistanalainen)</li>

					<li><strong>Vastustaa tietojensa käsittelyä</strong>, kun käsittely perustuu
					oikeutettuun etuun</li>

					<li><strong>Siirtää tietonsa</strong> toiselle rekisterinpitäjälle koneluettavassa muodossa
					(tietojen siirrettävyys)</li>

					<li><strong>Peruuttaa suostumuksensa</strong> milloin tahansa, kun käsittely perustuu
					suostumukseen (esim. markkinointiviestien vastaanotto)</li>

					<li><strong>Tehdä valitus valvontaviranomaiselle</strong>, jos katsoo, että häntä koskevien
					henkilötietojen käsittelyssä rikotaan tietosuoja-asetusta</li>
				</ul><br/>

				<strong>Valvontaviranomainen Suomessa:</strong><br/>
				Tietosuojavaltuutetun toimisto<br/>
				Käyntiosoite: Lintulahdenkuja 4, 00530 Helsinki<br/>
				Postiosoite: PL 800, 00531 Helsinki<br/>
				Puhelinvaihde: 029 56 66700<br/>
				Sähköposti: tietosuoja@om.fi<br/>
				Verkkosivu: <a href="https://tietosuoja.fi" target="_blank" rel="noopener noreferrer">https://tietosuoja.fi</a>
			`,

			section11Title: "11. Automaattinen päätöksenteko",
			section11Content: `
				Rekisterissä ei käytetä GDPR:n artiklan 22 mukaista automaattista päätöksentekoa tai profilointia.
				Kaikki jäsenyyttä koskevat päätökset (esim. jäsenhakemusten hyväksyminen) tekee ihminen.
			`,
		},

		footer: {
			version: "Versio",
			privacyPolicy: "Tietosuojaseloste",
			registryDisclosure: "Rekisteriseloste",
			organization: "Tietokilta ry",
			businessId: "Y-tunnus: 1790346-8",
			contact: "Yhteystiedot",
			email: "hallitus@tietokilta.fi",
			address: "Konemiehentie 2, 02150 Espoo",
		},
	},
} satisfies BaseTranslation;

export default fi;

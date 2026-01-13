import type { BaseTranslation } from "../i18n-types";

const fi = {
	// Application
	app: {
		title: "Jäsenrekisteri",
	},

	// Navigation
	nav: {
		title: "Navigaatio",
		dashboard: "Etusivu",
		membership: "Jäsenyys",
		settings: "Asetukset",
		profile: "Profiili",
		passkeys: "Avaimet",
		emails: "Sähköpostit",
		admin: {
			title: "Hallinta",
			members: "Jäsenet",
			memberships: "Jäsenyydet",
			users: "Käyttäjät",
		},
		signOut: "Kirjaudu ulos",
	},

	// Dashboard
	dashboard: {
		welcome: "Tervetuloa, {name}!",
		membershipStatus: "Jäsenyystila",
		noMembership: "Ei aktiivista jäsenyyttä",
		getFirstMembership: "Hanki jäsenyys",
		viewAll: "Näytä kaikki",
		purchaseNew: "Osta uusi",
		renewMembership: "Uusi jäsenyys",
		profileIncomplete: "Täydennä profiilisi",
		profileIncompleteDescription: "Tarvitsemme nimesi ja kotikuntasi jäsenyyden rekisteröintiä varten.",
		completeProfile: "Siirry profiiliin",
		paymentSuccess: "Maksu onnistui!",
		paymentSuccessDescription: "Jäsenyytesi päivittyy hetken kuluttua.",
	},

	// Settings
	settings: {
		title: "Asetukset",
		description: "Hallinnoi profiiliasi ja asetuksiasi",
		profile: {
			title: "Profiili",
			description: "Henkilötiedot ja asetukset",
			emailManagement: "Sähköposteja hallinnoidaan <>sähköpostisivulla<>.",
		},
		passkeys: {
			title: "Avaimet",
			description: "Hallinnoi avainkoodeja",
		},
		emails: {
			title: "Sähköpostit",
			description: "Hallinnoi toissijaisia sähköposteja",
		},
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
			lastUsed: "viimeksi käytetty",

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

	// Secondary Emails
	secondaryEmail: {
		// Page titles
		title: "Sähköpostit",
		manageDescription: "Hallinnoi sähköposteja kirjautumista ja jäsenyyden vahvistamista varten",

		// Primary email
		primary: "Ensisijainen",
		primaryDescription: "Tämä on ensisijainen sähköpostiosoitteesi",

		// Add email
		addEmail: "Lisää sähköposti",
		adding: "Lisätään...",
		emailAddress: "Sähköpostiosoite",
		emailPlaceholder: "teemu.teekkari@aalto.fi",
		addAndVerify: "Lisää ja vahvista sähköposti",

		// Verification
		verifyTitle: "Vahvista sähköpostisi",
		verifyDescription: "Lähetimme 8-numeroisen koodin osoitteeseen {email}",
		code: "Vahvistuskoodi",
		verify: "Vahvista",
		resendCode: "Lähetä uusi koodi",
		changeEmail: "Vaihda sähköpostiosoite",

		// Status
		status: {
			verified: "Vahvistettu",
			unverified: "Vahvistamaton",
			expired: "Vanhentunut",
		},

		// Details
		verifiedAt: "Vahvistettu",
		expiresAt: "Vanhenee",
		neverExpires: "Ei vanhene",
		domain: "Verkkotunnus",

		// Actions
		delete: "Poista sähköposti",
		deleteConfirm: "Haluatko varmasti poistaa tämän sähköpostin?",
		reverify: "Vahvista uudelleen",
		verifyNow: "Vahvista nyt",
		makePrimary: "Vaihda ensisijaiseksi",
		makePrimaryConfirm:
			"Haluatko varmasti vaihtaa {email} ensisijaiseksi sähköpostiosoitteeksi? Nykyinen ensisijainen sähköpostiosoite siirtyy toissijaisiin sähköposteihin.",

		// Messages
		addSuccess: "Vahvistuskoodi lähetetty osoitteeseen {email}",
		verifySuccess: "Sähköposti vahvistettu onnistuneesti!",
		verifySuccessExpires: "Sähköposti vahvistettu! Vanhenee {date}",
		deleteSuccess: "Sähköposti poistettu onnistuneesti",
		makePrimarySuccess: "Ensisijainen sähköposti vaihdettu onnistuneesti",
		expiredMessage: "Aalto-sähköpostisi vahvistus on vanhentunut",
		notVerifiedMessage: "Aalto-sähköpostia ei vahvistettu",
		verifiedDomainEmail: "Aalto-sähköposti vahvistettu",
		expiresOn: "vanhenee {date}",
		addDomainEmail: "Lisää {domain}-sähköposti →",
		reverifyNow: "Vahvista nyt →",

		// Errors
		invalidEmail: "Virheellinen sähköpostiosoite",
		emailExists: "Tämä sähköpostiosoite on jo rekisteröity",
		limitReached: "Enintään 10 toissijaista sähköpostia sallittu",
		verificationFailed: "Virheellinen vahvistuskoodi",
		rateLimited: "Liian monta pyyntöä. Yritä myöhemmin uudelleen",

		// Empty state
		noEmails: "Ei toissijaisia sähköposteja",
		noEmailsDescription: "Lisää toissijainen sähköposti kirjautumista tai jäsenyyden vahvistamista varten",

		// Info
		infoExpiring: "Aalto.fi-sähköpostit vanhenevat 6 kuukauden kuluttua ja vaativat uudelleenvahvistuksen",
		infoGeneral: "Toissijaisia sähköposteja voidaan käyttää kirjautumiseen ja jäsenyyden vahvistamiseen",
	},

	// Membership
	membership: {
		title: "Jäsenyydet",
		historyDescription: "Näytä ja hallitse jäsenyyksiäsi",
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
		getStarted: "Osta jäsenyys päästäksesi alkuun",
		currentMemberships: "Aktiiviset jäsenyydet",
		pastMemberships: "Aiemmat jäsenyydet",

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
			fetchingStripeMetadata: "Haetaan Stripe-tietoja...",
			stripeMetadataPreview: "Stripe-tiedot:",
			productName: "Tuotteen nimi",
			priceNickname: "Hinnan nimi",
			amount: "Summa",
			priceInactive: "Varoitus: Tämä hinta ei ole aktiivinen Stripessä",
			legacyMembership: "Arkistojäsenyys (ei Stripe-hintaa)",
			failedToLoadPrice: "Hinnan lataus epäonnistui",
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

		users: {
			title: "Hallinnoi käyttäjiä",
			description: "Hallinnoi käyttäjätilejä ja ylläpitäjiä",
			adminsSection: "Ylläpitäjät",
			usersSection: "Käyttäjät",

			table: {
				search: "Hae käyttäjiä...",
				id: "ID",
				email: "Sähköposti",
				name: "Nimi",
				role: "Rooli",
				lastSession: "Viimeisin istunto",
				actions: "Toiminnot",
				active: "Aktiivinen",
				sessionExpired: "Vanhentunut",
				promote: "Ylennä ylläpitäjäksi",
				demote: "Poista ylläpitäjyys",
				merge: "Yhdistä käyttäjät",
				noUsers: "Ei käyttäjiä",
				noResults: "Ei hakutuloksia",
				showing: "Näytetään {current} / {total} käyttäjää",
			},

			merge: {
				title: "Yhdistä käyttäjät",
				description:
					"Yhdistä kaksi käyttäjätiliä yhteen. Toissijaisen käyttäjän kaikki tiedot siirretään ensisijaiselle käyttäjälle.",
				selectSecondary: "Valitse yhdistettävä käyttäjä",
				selectSecondaryPlaceholder: "Hae käyttäjiä sähköpostilla tai nimellä...",
				step1Title: "Vaihe 1: Valitse yhdistettävä käyttäjä",
				step2Title: "Vaihe 2: Tarkista yhdistettävät tiedot",
				step3Title: "Vaihe 3: Vahvista yhdistäminen",
				primaryUser: "Ensisijainen käyttäjä (säilyy)",
				secondaryUser: "Toissijainen käyttäjä (poistetaan)",
				willBeMerged: "Seuraavat siirretään ensisijaiselle käyttäjälle:",
				memberships: "Kaikki jäsenyydet",
				secondaryEmails: "Kaikki toissijaiset sähköpostit",
				passkeys: "Kaikki avainkoodit",
				sessions: "Kaikki aktiiviset istunnot",
				primaryEmailWillBecome: "Toissijaisen käyttäjän sähköposti muuttuu toissijaiseksi sähköpostiksi",
				confirmByTyping: "Vahvista kirjoittamalla molemmat sähköpostiosoitteet:",
				irreversibleWarning:
					"Tätä toimintoa ei voi perua. Toissijainen käyttäjätili poistetaan pysyvästi ja kaikki tiedot siirretään ensisijaiselle käyttäjälle.",
				typePrimaryEmail: "Kirjoita ensisijaisen käyttäjän sähköposti",
				typeSecondaryEmail: "Kirjoita toissijaisen käyttäjän sähköposti",
				cancel: "Peruuta",
				next: "Seuraava",
				previous: "Edellinen",
				mergeUsers: "Yhdistä käyttäjät",
				merging: "Yhdistetään...",
				success: "Käyttäjät yhdistetty onnistuneesti!",
				overlappingMembershipsError:
					"Yhdistäminen epäonnistui: molemmilla käyttäjillä on jäsenyys samalle ajanjaksolle",
				noOverlappingMemberships: "Ei päällekkäisiä jäsenyyksiä - yhdistäminen on turvallista",
				checkingMemberships: "Tarkistetaan jäsenyyksiä...",
			},
		},
	},

	// Common
	common: {
		save: "Tallenna",
		delete: "Poista",
	},

	// Error page
	error: {
		title: "Hups! Jotain meni pieleen",
		notFound: "Sivua ei löytynyt",
		notFoundDescription: "Etsimääsi sivua ei ole olemassa tai se on siirretty.",
		serverError: "Palvelinvirhe",
		genericError: "Tapahtui virhe",
		errorCode: "Virhekoodi: {code}",
		backToHome: "Takaisin etusivulle",
		tryAgain: "Yritä uudelleen",
	},

	// Documents & Legal
	documents: {
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

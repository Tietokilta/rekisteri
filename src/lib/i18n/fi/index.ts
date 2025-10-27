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
		emailSubject: "Tietokillan jäsenrekisterin sisäänkirjautumiskoodi",
		emailBody: "Koodisi on {code}",
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
		allowEmails: "Jäsenyyteen liittymättömät sähköpostit",
		allowEmailsDescription:
			"Kilta saa lähettää sähköpostia jäsenyyteeni liittymättömistä asioista (esim. viikkotiedote)",
	},

	// Membership
	membership: {
		title: "Jäsenyydet",
		current: "Nykyiset jäsenyydet",
		createNew: "Luo uusi jäsenyys",
		buy: "Osta jäsenyys",
		select: "Valitse jäsenyys",
		type: "Tyyppi",
		continuityNote: "Jäsenyyksien jatkuvuus yhdistetään tyypin mukaisesti",
		startTime: "Alkamisaika",
		endTime: "Päättymisaika",
		priceCents: "Hinta sentteinä",
		price: "hinta {price}€",
		add: "Lisää jäsenyys",
		noMembership: "Ei jäsenyyttä",
		requiresStudentVerification: "Vaatii opiskelijastatuksen vahvistuksen",
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
			stripePriceIdDescription: "Stripen dashboardilta löytyvä tuotekoodi (Price ID)",
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
				filterYear: "Vuosi:",
				filterType: "Tyyppi:",
				filterStatus: "Tila:",
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
			note: "Huom: Olemassa olevien käyttäjien tiedot päivitetään. Duplikaatti jäsentietueet (sama käyttäjä + jäsenyys) ohitetaan.",
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
} satisfies BaseTranslation;

export default fi;

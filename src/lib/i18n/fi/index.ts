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
      membershipTypes: "Jäsenyystyypit",
      users: "Käyttäjät",
      verifyQr: "Tarkista QR",
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
    completePayment: "Jatka maksua",
    profileIncomplete: "Täydennä profiilisi",
    profileIncompleteDescription: "Tarvitsemme nimesi ja kotikuntasi jäsenyyden rekisteröintiä varten.",
    completeProfile: "Siirry profiiliin",
    paymentSuccess: "Maksu onnistui!",
    paymentSuccessDescription: "Jäsenyytesi päivittyy hetken kuluttua.",
  },

  // Member Card
  memberCard: {
    title: "Jäsenkortti",
    show: "Näytä jäsenkortti",
    close: "Sulje",
    qrAlt: "Jäsentodistuksen QR-koodi",
    qrError: "QR-koodin luominen epäonnistui",
    retry: "Yritä uudelleen",
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
    noEmailFound: "Sähköpostia ei löytynyt",
    incorrectCode: "Virheellinen koodi.",
    codeExpiredResent: "Vahvistuskoodi oli vanhentunut. Lähetimme uuden koodin sähköpostiisi.",
    codeSent: "Uusi koodi on lähetetty sähköpostiisi.",
    emailNotFound: "Sähköpostia ei löytynyt",

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

      // Server errors
      tooManyAttempts: "Liian monta tunnistautumisyritystä. Yritä myöhemmin uudelleen.",
      failedGenerateAuthOptions: "Tunnistautumisasetusten luominen epäonnistui",
      noAuthChallenge: "Tunnistautumishaastetta ei löytynyt. Aloita tunnistautuminen uudelleen.",
      failedVerifyAuth: "Tunnistautumisen varmennus epäonnistui",
      failedGenerateRegOptions: "Rekisteröintiasetusten luominen epäonnistui",
      noRegChallenge: "Rekisteröintihaastetta ei löytynyt. Aloita rekisteröinti uudelleen.",
      failedVerifyReg: "Avainkoodin rekisteröinnin varmennus epäonnistui",
      failedList: "Avainkoodien haku epäonnistui",
      notFound: "Avainkoodia ei löytynyt tai se ei kuulu käyttäjälle",

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

  // Emails
  emails: {
    otp: {
      subject: "Tietokillan jäsenrekisterin sisäänkirjautumiskoodi",
      body: `Kirjautumiskoodisi on: {code}

Koodi vanhenee 10 minuutin kuluttua.

@{domain} #{code}`,
    },
    paymentSuccess: {
      subject: "Maksu vastaanotettu - Odottaa hallituksen hyväksyntää",
      body: `Kiitos {membershipName}-jäsenyytesi maksusta ({amount})!

Maksusi on vastaanotettu ja jäsenhakemuksesi odottaa hallituksen hyväksyntää seuraavassa kokouksessa.

Saat sähköpostiviestin, kun jäsenyytesi on hyväksytty.

Terveisin,
Tietokilta`,
    },
    membershipApproved: {
      subject: "Tervetuloa Tietokiltaan!",
      body: `Hei {firstName}!

Jäsenhakemuksesi on hyväksytty. Tervetuloa Tietokillan jäseneksi!

Jäsenyystiedot:
- Jäsenyystyyppi: {membershipName}
- Voimassa: {startDate} - {endDate}

Voit nyt osallistua killan toimintaan ja hyödyntää jäsenetuja.

Nähdään tapahtumissa!

Terveisin,
Tietokilta`,
    },
    membershipRenewed: {
      subject: "Jäsenyytesi on uusittu!",
      body: `Hei {firstName}!

Jäsenyytesi on uusittu automaattisesti maksun jälkeen.

Jäsenyystiedot:
- Jäsenyystyyppi: {membershipName}
- Voimassa: {startDate} - {endDate}

Kiitos, että jatkat jäsenenämme!

Terveisin,
Tietokilta`,
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
    couldNotAdd: "Sähköpostia ei voitu lisätä. Kokeile toista osoitetta.",
    emailNotFound: "Sähköpostia ei löytynyt",
    couldNotChangePrimary:
      "Ensisijaista sähköpostia ei voitu vaihtaa. Sähköpostin on oltava vahvistettu eikä se saa olla vanhentunut.",
    tooManyAttempts: "Liian monta yritystä. Yritä myöhemmin uudelleen.",

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
    description: "Perustelut jäsenhakemukselle",
    descriptionPlaceholder: "Kerro, miksi haet jäsenyyttä...",
    descriptionRequired: "Perustelut jäsenhakemukselle vaaditaan",
    getStarted: "Osta jäsenyys päästäksesi alkuun",
    currentMemberships: "Aktiiviset jäsenyydet",
    pastMemberships: "Aiemmat jäsenyydet",
    moreInfoInBylaws: "Lisätietoja jäsenyyksistä killan säännöissä",
    alreadyHaveMembershipForPeriod: "Sinulla on jo jäsenyys tälle ajanjaksolle",
    noAvailableMemberships:
      "Ei ostettavia jäsenyyksiä. Sinulla on jo jäsenyys kaikille saatavilla oleville ajanjaksoille.",
    willAutoApprove: "Hyväksytään automaattisesti maksun jälkeen",
    willRequireApproval: "Vaatii hallituksen hyväksynnän maksun jälkeen",
    autoApprovalAdminNote:
      "Jäsenet, joilla on hyväksytty jäsenyys samaa tyyppiä edellisellä kaudella, hyväksytään automaattisesti uusiessaan jäsenyytensä. Opiskelijajäsenyyksien automaattinen hyväksyntä edellyttää myös voimassa olevaa aalto.fi-sähköpostia.",
    studentVerificationRequired:
      "Opiskelijastatuksen vahvistus vaaditaan. Lisää ja vahvista Aalto-sähköpostiosoitteesi.",
    paymentSessionFailed: "Maksuistunnon luominen epäonnistui",

    // Status (aligned with bylaws / säännöt)
    status: {
      active: "Voimassa oleva jäsenyys",
      resigned: "Eronnut",
      rejected: "Hylätty",
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
      editMembership: "Muokkaa jäsenyyttä",
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

    membershipTypes: {
      title: "Hallinnoi jäsenyystyyppejä",
      description: "Luo ja muokkaa jäsenyystyyppejä",
      createNew: "Luo uusi tyyppi",
      createDescription: "Luo uusi jäsenyystyyppi, jota voidaan käyttää jäsenyyksissä",
      editType: "Muokkaa jäsenyystyyppiä",
      noTypes: "Ei jäsenyystyyppejä",
      id: "Tunniste",
      idDescription: "Yksilöllinen tunniste (käytetään sisäisesti). Käytä pieniä kirjaimia, numeroita ja tavuviivoja.",
      idCannotChange: "Tunnistetta ei voi muuttaa luomisen jälkeen",
      nameFi: "Nimi (suomeksi)",
      nameEn: "Nimi (englanniksi)",
      descriptionFi: "Kuvaus (suomeksi, valinnainen)",
      descriptionEn: "Kuvaus (englanniksi, valinnainen)",
      descriptionPlaceholder: "Valinnainen kuvaus jäsenyystyypille...",
      cannotDeleteInUse: "Jäsenyystyyppiä ei voi poistaa, koska sillä on jäsenyyksiä",
      idAlreadyExists: "Tämän tunnisteen omaava jäsenyystyyppi on jo olemassa",
      membershipTypeNotFound: "Jäsenyystyyppiä ei löytynyt",
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
        resigned: "Eronnut",
        rejected: "Hylätty",
        awaitingApproval: "Odottaa hyväksyntää",
        awaitingPayment: "Odottaa maksua",

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
        descriptionLabel: "Perustelut:",

        // Actions
        approve: "Hyväksy",
        reject: "Hylkää",
        reactivate: "Aktivoi uudelleen",
        deemResigned: "Katso eronneeksi (§8)",
        resignMembership: "Erota (§8)",

        // Pagination
        showing: "Näytetään {current} / {total} jäsentä",
        previous: "Edellinen",
        next: "Seuraava",

        // Bulk actions
        selectAll: "Valitse kaikki",
        selectRow: "Valitse rivi",
        selectedCount: "{count} valittu",
        bulkApprove: "Hyväksy ({count})",
        bulkDeemResigned: "Katso eronneeksi ({count})",
        clearSelection: "Tyhjennä valinta",

        // Confirmation dialogs — bulk
        confirmApproveTitle: "Hyväksy {count} jäsentä",
        confirmApproveDescription: "Haluatko varmasti hyväksyä seuraavat jäsenet?",
        confirmDeemResignedTitle: "Katso {count} jäsentä eronneeksi",
        confirmDeemResignedDescription:
          "Haluatko varmasti katsoa seuraavat jäsenet eronneiksi? Syy tallennetaan lokiin.",
        confirm: "Vahvista",
        cancel: "Peruuta",

        // Confirmation dialogs — individual
        confirmApproveSingleTitle: "Hyväksy jäsenyys",
        confirmApproveSingleDescription: "Haluatko hyväksyä jäsenen {name} jäsenyyden?",
        confirmDeemResignedSingleTitle: "Katso jäsen eronneeksi",
        confirmDeemResignedSingleDescription: "Haluatko katsoa jäsenen {name} eronneeksi?",
        confirmResignSingleTitle: "Erota jäsen",
        confirmResignSingleDescription: "Haluatko kirjata jäsenen {name} eroamisen?",
        confirmRejectSingleTitle: "Hylkää jäsenyys",
        confirmRejectSingleDescription: "Haluatko hylätä jäsenen {name} hakemuksen?",
        confirmReactivateSingleTitle: "Aktivoi jäsenyys uudelleen",
        confirmReactivateSingleDescription: "Haluatko aktivoida jäsenen {name} jäsenyyden uudelleen?",
        reasonLabel: "Syy (tallennetaan lokiin)",
        deemResignedDefaultReason: "Eronneeksi katsominen (sääntöjen 8 § 2 mom.) — jäsenmaksu maksamatta",
      },

      // Server errors
      memberNotFound: "Jäsentä ei löytynyt",
      notAwaitingApproval: "Jäsentä ei voi hyväksyä tästä tilasta",
      cannotReject: "Jäsentä ei voi hylätä tästä tilasta",
      cannotDeemResigned: "Jäsentä ei voi katsoa eronneeksi tästä tilasta",
      cannotResign: "Jäsenen eroamista ei voi kirjata tästä tilasta",
      cannotReactivate: "Vain eronneet tai hylätyt jäsenyydet voidaan aktivoida uudelleen",
      noMembersAwaitingApproval: "Yksikään jäsen ei odota hyväksyntää",
      noMembersCanBeResigned: "Yhtään jäsentä ei voi katsoa eronneeksi",
      noMembersCanBeReactivated: "Yhtään jäsentä ei voi aktivoida uudelleen",
    },

    import: {
      title: "Tuo jäseniä",
      description: "Tuo jäseniä CSV-tiedostosta",
      step1: "1. Lataa CSV-tiedosto",
      step2: "2. Tarkista ja ratkaise",
      step3: "3. Tuo",
      csvFile: "CSV-tiedosto",
      expectedColumns: "Odotetut sarakkeet:",
      existingMemberships: "Olemassa olevat jäsenyydet tietokannassa:",
      matchNote: "CSV-rivit yhdistetään tyypin + alkamispäivän perusteella. Puuttuvat jäsenyydet voidaan luoda alla.",
      availableTypeIds: "Käytettävissä olevat jäsenyystyyppitunnisteet:",
      start: "Alkaa:",
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
      willBeResigned: "Merkitään eronneiksi:",
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
      // Analysis categories
      matched: "Yhdistetty",
      matchedDesc: "{count} {{rivi|riviä}} yhdistetty olemassa oleviin jäsenyyksiin",
      unmatched: "Ratkaisua tarvitaan",
      unmatchedDesc: "{count} {{rivi|riviä}} tarvitsee jäsenyysratkaisun",
      errors: "Virheet",
      errorsDesc: "{count} {{rivi|riviä}} sisältää vahvistusvirheitä",
      // Unmatched resolution
      unmatchedMemberships: "Puuttuvat jäsenyydet",
      unmatchedMembershipsDesc: "Seuraavia jäsenyystyypin + alkamispäivän yhdistelmiä ei löydy tietokannasta:",
      quickCreate: "Pikaluo",
      quickCreateDesc: "Luo legacy-jäsenyys (päättyy {endDate})",
      linkToExisting: "Yhdistä olemassa olevaan",
      selectMembership: "Valitse jäsenyys...",
      createAllMissing: "Luo kaikki puuttuvat jäsenyydet",
      creating: "Luodaan...",
      created: "Luotu!",
      linked: "Yhdistetty",
      createFailed: "Jäsenyyden luonti epäonnistui",
      rowsAffected: "koskee {count:number} {{riviä|riviä}}",
      resolveToImport: "Ratkaise kaikki puuttuvat rivit mahdollistaaksesi tuonnin",
      invalidDataFormat: "Virheellinen datamuoto",
      csvColumnsMismatch: "CSV-sarakkeet eivät vastaa odotettuja: {columns:string}",
      invalidTypeIdsError:
        "Virheelliset jäsenyystyyppitunnisteet: {invalidTypes:string}. Käytettävissä: {availableIds:string}",
      rowError: "Rivi {row:number}: {message:string}",
      rowErrorDetail: "Rivi {row:number} ({email:string}): {error:string}",
      or: "tai",
      statusHeader: "Tila",
      pending: "Odottaa",
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
        lastActive: "Viimeksi aktiivinen",
        actions: "Toiminnot",
        never: "Ei koskaan",
        promote: "Ylennä ylläpitäjäksi",
        demote: "Poista ylläpitäjyys",
        merge: "Yhdistä käyttäjät",
        noUsers: "Ei käyttäjiä",
        noResults: "Ei hakutuloksia",
        showing: "Näytetään {current} / {total} käyttäjää",
      },

      // Server errors
      userNotFound: "Käyttäjää ei löytynyt",
      alreadyAdmin: "Käyttäjä on jo ylläpitäjä",
      notAdmin: "Käyttäjä ei ole ylläpitäjä",
      cannotDemoteSelf: "Et voi poistaa omaa ylläpitäjyyttäsi",
      cannotDemoteLastAdmin: "Viimeisen ylläpitäjän ylläpitäjyyttä ei voi poistaa",
      cannotMergeSelf: "Käyttäjää ei voi yhdistää itsensä kanssa",
      primaryUserNotFound: "Ensisijaista käyttäjää ei löytynyt",
      secondaryUserNotFound: "Toissijaista käyttäjää ei löytynyt",
      primaryEmailMismatch: "Ensisijaisen sähköpostin vahvistus ei täsmää",
      secondaryEmailMismatch: "Toissijaisen sähköpostin vahvistus ei täsmää",
      cannotMergeOverlapping:
        'Yhdistäminen epäonnistui: Molemmilla käyttäjillä on jäsenyys "{type:string}" samalle ajanjaksolle ({startDate:string} - {endDate:string})',

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

    verifyQr: {
      title: "Tarkista jäsenen QR-koodi",
      description: "Skannaa jäsenten QR-koodeja tarkistaaksesi jäsenyyden tilan",
      startScanning: "Aloita skannaus",
      stopScanning: "Lopeta skannaus",
      scanInstructions: "Osoita kamera jäsenen QR-koodiin",
      cameraError: "Kameraan ei saatu yhteyttä. Tarkista käyttöoikeudet.",
      invalidQr: "Virheellinen QR-koodi. Tätä koodia ei tunnisteta.",
      verifyError: "QR-koodin tarkistus epäonnistui. Yritä uudelleen.",
      userInfo: "Jäsenen tiedot",
      memberships: "Jäsenyydet",
      noMemberships: "Jäsenyyksiä ei löytynyt",
      scanNext: "Skannaa seuraava",
      closeScanner: "Sulje skanneri",
    },
  },

  // Common
  common: {
    save: "Tallenna",
    delete: "Poista",
    deleteFailed: "Poistaminen epäonnistui",
    edit: "Muokkaa",
    cancel: "Peruuta",
    actions: "Toiminnot",
    create: "Luo",
    select: "Valitse",
    loading: "Ladataan...",
    optional: "valinnainen",
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
    traceId: "Seurantatunnus: {traceId}",
    contactSupport: "Jos ongelma jatkuu, ota yhteyttä digitaalisten palveluiden valiokuntaan:",
    contactSupportWithId: "Ota yhteyttä sähköpostilla {email} ja kerro seurantatunnus nopeampaa selvitystä varten.",

    // Form/API validation errors
    notAuthenticated: "Ei tunnistautunut",
    tooManyRequests: "Liian monta pyyntöä",
    tooManyRequestsNetwork:
      "Liian monta pyyntöä. Tämä voi johtua verkkoliikenteestä tai useista yrityksistä. Yritä myöhemmin tai eri verkon kautta.",
    unauthorized: "Ei valtuuksia",
    resourceNotFound: "Ei löytynyt",
    updateFailed: "Tietojen päivittäminen epäonnistui",
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

import type { Translation } from "../i18n-types";

const en = {
	// Application
	app: {
		title: "CSG Membership Registry",
	},

	// Authentication
	auth: {
		signIn: "Sign in",
		signOut: "Sign out",
		email: "Email",
		code: "Code",
		verify: "Verify",
		codeSentTo: "We sent an 8-digit code to {email}.",
		resendCode: "Resend code",
		changeEmail: "Change email address",
		emailSubject: "CSG Membership Registry Sign In Code",
		emailBody: "Your code is {code}",

		// Passkey
		passkey: {
			signInWithPasskey: "Sign in with passkey",
			sendEmailCode: "Send email code",
			signingInAs: "Signing in as:",
			useDifferentEmail: "Use a different email",
			or: "or",
			authenticating: "Authenticating...",
			authFailed: "Authentication failed. Please try again or use email code.",
			authCancelled: "Authentication was cancelled",
			rateLimited: "Too many attempts. Please try again later or use email code.",
			regFailed: "Failed to register passkey. Please try again later.",
			regCancelled: "Registration was cancelled",
			regAlreadyRegistered:
				"This device is already registered. If you want to re-register, please delete the old passkey first.",

			// Banner
			bannerTitle: "Add a passkey",
			bannerSetup: "Set up now",
			settingUp: "Setting up...",
			dismiss: "Dismiss",

			// Management page
			title: "Passkeys",
			manageDescription: "Manage your passkeys for faster sign-in",
			addPasskey: "Add passkey",
			adding: "Adding...",
			noPasskeys: "No passkeys",
			createdAt: "Created",
			lastUsedAt: "Last used",
			never: "Never",
			synced: "Synced",
			transports: "Transports",
			deleteConfirm: "Are you sure you want to delete this passkey?",
			deletePasskey: "Delete passkey",
			rename: "Rename",
			deviceName: "Device name",
			save: "Save",
			saving: "Saving...",
			cancel: "Cancel",
			continue: "Continue",
			nameOptional: "Optional - leave empty to use date",
			nameThisPasskey: "Name this passkey?",
			renameHint: "You can rename passkeys after adding them",
		},
	},

	// User
	user: {
		welcome: "Welcome {firstNames} {lastName}!",
		hi: "Hi, {email}!",
		editInfo: "Edit your information",
		email: "Email",
		firstNames: "First names",
		lastName: "Last name",
		homeMunicipality: "Home municipality",
		preferredLanguage: "Preferred language (optional)",
		preferredLanguageDescription:
			"Language you prefer to receive communications in (e.g. membership emails or weekly newsletters)",
		preferredLanguageOptions: {
			unspecified: "Unspecified",
			finnish: "Finnish",
			english: "English",
		},
		allowEmails: "Other emails",
		allowEmailsDescription: "Receive emails about things not related to membership (e.g. weekly newsletters)",
		saveSuccess: "Information saved successfully",
		saveError: "Failed to save information",
	},

	// Membership
	membership: {
		title: "Memberships",
		current: "Current memberships",
		createNew: "Create a new membership",
		buy: "Buy membership",
		select: "Select membership type",
		type: "Type",
		continuityNote: "Memberships continue automatically if they are of the same type",
		startTime: "Start time",
		endTime: "End time",
		priceCents: "Price cents",
		price: "Price {price}€",
		add: "Add membership",
		noMembership: "No membership",
		requiresStudentVerification: "Requires student verification",
		isStudent: "I am a student in Aalto University",

		// Status
		status: {
			active: "Valid membership",
			expired: "Expired",
			awaitingPayment: "Awaiting payment",
			awaitingApproval: "Awaiting approval",
			unknown: "Unknown status",
		},
	},

	// Admin
	admin: {
		title: "Admin panel",

		memberships: {
			title: "Manage memberships",
			description: "Configure price and period",
			stripePriceId: "Stripe price ID",
			stripePriceIdDescription: "Price ID found on Stripe dashboard",
			stripePriceIdLabel: "Price ID {stripePriceId}",
		},

		members: {
			title: "Manage members",
			description: "Manage individual members",
			listTitle: "Members",
			count: "{count} {{member|members}}",
			homeMunicipality: "Home municipality: {homeMunicipality}",
			membershipType: "Membership type: {membershipType}",
			userId: "User Identifier",
			userIdentifier: "Identifier",

			// Table
			table: {
				search: "Search members...",
				copyAsText: "Copy as Text",
				copied: "Copied!",
				exportJasenet: "Export jasenet@",
				exportAktiivit: "Export aktiivit@",
				exported: "Exported!",
				filterYear: "Year:",
				filterType: "Type:",
				filterStatus: "Status:",
				filterEmailAllowed: "Emails:",
				emailAllowed: "Allowed",
				emailNotAllowed: "Not Allowed",
				all: "All",
				active: "Active",
				expired: "Expired",
				awaitingApproval: "Awaiting Approval",
				awaitingPayment: "Awaiting Payment",
				cancelled: "Cancelled",

				// Column headers
				firstNames: "First Names",
				lastName: "Last Name",
				email: "Email",
				membershipType: "Membership Type",
				status: "Status",

				// Row details
				membershipsCount: "{count} {{membership|memberships}}",
				userDetails: "User Details",
				userIdLabel: "User ID:",
				emailLabel: "Email:",
				municipalityLabel: "Municipality:",
				preferredLanguageLabel: "Preferred Language:",
				emailAllowedLabel: "Email Allowed:",
				yes: "Yes",
				no: "No",

				// Membership details
				memberships: "Memberships",
				membershipsOf: "{filtered} of {total} memberships",
				typeLabel: "Type:",
				periodLabel: "Period:",
				priceLabel: "Price:",
				statusLabel: "Status:",
				createdLabel: "Created:",
				stripeSessionLabel: "Stripe Session:",

				// Actions
				approve: "Approve",
				reject: "Reject",
				reactivate: "Reactivate",
				markExpired: "Mark as Expired",
				cancelMembership: "Cancel Membership",

				// Pagination
				showing: "Showing {current} of {total} members",
				previous: "Previous",
				next: "Next",
			},
		},

		import: {
			title: "Import members",
			description: "Import members from CSV file",
			step1: "1. Upload CSV File",
			step2: "2. Preview & Import",
			csvFile: "CSV File",
			expectedColumns: "Expected columns:",
			existingMemberships: "Existing memberships in database:",
			matchNote: "CSV rows must match these exactly (type + start date). Memberships are NOT created by import.",
			start: "Start:",
			end: "End:",
			validationErrors: "Validation Errors:",
			success: "Import Successful!",
			successCount: "Imported {successCount} of {totalRows} {{member|members}}",
			viewErrors: "View {errorCount} {{error|errors}}",
			failed: "Import Failed",
			preview: "Import Preview",
			uniqueUsers: "Unique users (created or updated):",
			recordsToCreate: "Member records to create:",
			willBeActive: "Will be marked as active:",
			willBeExpired: "Will be marked as expired:",
			note: "Note: Existing users will have their info updated. Overlapping member records (same user + membership) will be skipped.",
			dataPreview: "CSV Data Preview",
			firstNames: "First Names",
			lastName: "Last Name",
			municipality: "Municipality",
			email: "Email",
			membershipType: "Membership Type",
			startDate: "Start Date",
			showingRows: "Showing first 10 of {rowCount} rows",
			noRows: "No valid rows to import",
			uploadPrompt: "Upload a CSV file to preview",
			importing: "Importing...",
			importButton: "Import {count} {{member|members}}",
		},
	},

	// Common
	common: {
		save: "Save",
		delete: "Delete",
	},

	// Documents & Legal
	documents: {
		privacyPolicy: {
			title: "Privacy Policy",
			lastUpdated: "Last updated: November 5, 2025",

			section1Title: "1. Data Controller",
			section1Content: `
				<strong>Computer Science Guild of Aalto University (Tietokilta ry)</strong><br/>
				Business ID: 1888541-3<br/>
				Address: Konemiehentie 2, 02150 Espoo, Finland<br/>
				Email: hallitus@tietokilta.fi<br/>
				Phone: +358 50 431 4761
			`,

			section2Title: "2. Contact Person for Data Protection Matters",
			section2Content: `
				For data protection inquiries, please contact the board at hallitus@tietokilta.fi
			`,

			section3Title: "3. Name of the Register",
			section3Content: `
				Tietokilta Membership Registry
			`,

			section4Title: "4. Purpose and Legal Basis for Processing Personal Data",
			section4Content: `
				<strong>Purpose of processing:</strong> Managing memberships, providing member services,
				communication with members, and fulfilling the association's legal obligations.<br/><br/>

				<strong>Legal basis:</strong> Performance of membership agreement (GDPR 6(1)(b)),
				legitimate interest in organizing member activities (GDPR 6(1)(f)), and
				consent for voluntary marketing communications (GDPR 6(1)(a)).
			`,

			section5Title: "5. Data Content of the Register",
			section5Content: `
				The following data is stored in the register:<br/><br/>

				<ul>
					<li><strong>Basic information:</strong> First name, last name, email address</li>
					<li><strong>Membership-related information:</strong> Membership type, validity period, payment history, membership status</li>
					<li><strong>Home municipality:</strong> Used for statistical purposes</li>
					<li><strong>Consents:</strong> Information about whether the association may send non-membership emails</li>
					<li><strong>Technical data:</strong> Session tokens, payment transaction IDs (Stripe)</li>
				</ul>
			`,

			section6Title: "6. Regular Sources of Data",
			section6Content: `
				Data is obtained from the member themselves during membership application or when updating
				their information in the system. Payment-related data is obtained from the Stripe payment system.
			`,

			section7Title: "7. Data Retention Period",
			section7Content: `
				Member data is retained as long as the person is a member of the association or there are
				legal obligations related to membership processing (e.g., accounting).<br/><br/>

				After membership ends, data is deleted or anonymized unless there is a legal basis for
				retention. Accounting records are retained for at least 6 years from the end of the fiscal year,
				as required by law.
			`,

			section8Title: "8. Data Disclosure and Transfers",
			section8Content: `
				<strong>Data recipients:</strong><br/><br/>

				<ul>
					<li><strong>Stripe:</strong> Payment processing service for membership fees</li>
					<li><strong>Mailgun:</strong> Email service for communications</li>
					<li><strong>Cloud service providers:</strong> Technical partners necessary for service maintenance</li>
				</ul>
				<br/>

				Data is not transferred outside the EU or EEA unless the service provider uses EU Commission-approved
				standard contractual clauses or other appropriate safeguards.<br/><br/>

				Data is not sold, rented, or disclosed to third parties for marketing purposes.
			`,
		},

		registryDisclosure: {
			title: "Register Description",
			lastUpdated: "Last updated: November 5, 2025",

			section1Title: "1. Data Controller",
			section1Content: `
				<strong>Computer Science Guild of Aalto University (Tietokilta ry)</strong><br/>
				Business ID: 1888541-3<br/>
				Address: Konemiehentie 2, 02150 Espoo, Finland<br/>
				Email: hallitus@tietokilta.fi<br/>
				Phone: +358 50 431 4761
			`,

			section2Title: "2. Name of the Register",
			section2Content: `
				Tietokilta Membership Registry
			`,

			section3Title: "3. Purpose of Processing Personal Data",
			section3Content: `
				The register is used for the following purposes:<br/><br/>

				<ul>
					<li>Maintaining and managing memberships</li>
					<li>Processing membership fees</li>
					<li>Communication with members (events, newsletters, member benefits)</li>
					<li>Fulfilling the association's legal obligations</li>
					<li>Statistics and development of operations</li>
				</ul>
			`,

			section4Title: "4. Data Content of the Register",
			section4Content: `
				<strong>Member basic information:</strong><br/>
				<ul>
					<li>First name and last name</li>
					<li>Email address</li>
					<li>Home municipality</li>
				</ul><br/>

				<strong>Membership information:</strong><br/>
				<ul>
					<li>Membership type (regular member, supporting member, student member, etc.)</li>
					<li>Membership start and end date</li>
					<li>Membership status (active, expired, awaiting approval, etc.)</li>
					<li>Payment history and payment information</li>
					<li>Stripe customer ID</li>
				</ul><br/>

				<strong>Consents:</strong><br/>
				<ul>
					<li>Reception of non-membership related emails</li>
				</ul><br/>

				<strong>Technical data:</strong><br/>
				<ul>
					<li>Session tokens for authentication</li>
					<li>Login codes and their expiration times</li>
					<li>Creation and update timestamps</li>
				</ul>
			`,

			section5Title: "5. Regular Sources of Data",
			section5Content: `
				Personal data is primarily collected from the member themselves in the following situations:<br/><br/>

				<ul>
					<li>Membership application and purchase</li>
					<li>Updating member information in the system</li>
					<li>Logging into the system</li>
				</ul><br/>

				Additionally, data may be obtained from:<br/>
				<ul>
					<li>Stripe payment system (payment transactions, payment information)</li>
					<li>Board member registry during bulk imports (e.g., members from previous years)</li>
				</ul>
			`,

			section6Title: "6. Data Retention Period",
			section6Content: `
				<strong>Active members:</strong> Data is retained for the duration of membership.<br/><br/>

				<strong>Former members:</strong> After membership ends, data is retained or anonymized
				according to the following principles:<br/><br/>

				<ul>
					<li>Accounting records (payments, invoices): at least 6 years from the end of the fiscal year</li>
					<li>Historically significant data: may be anonymized for statistics and historical records</li>
					<li>Other personal data: deleted when no longer necessary</li>
				</ul><br/>

				<strong>Technical data:</strong><br/>
				<ul>
					<li>Session tokens: deleted after 30 days</li>
					<li>Login codes: deleted after 10 minutes</li>
				</ul>
			`,

			section7Title: "7. Data Disclosure and Transfers",
			section7Content: `
				<strong>Regular disclosures:</strong><br/><br/>

				<ul>
					<li><strong>Stripe Inc.:</strong> Payment processing service. Data is securely transferred to
					Stripe's systems for payment processing. Stripe complies with GDPR requirements and uses
					EU Commission-approved standard contractual clauses.</li>

					<li><strong>Mailgun (Sinch MessageMedia Pty Ltd):</strong> Email service for sending communications.
					The service processes email addresses and message content.</li>

					<li><strong>Cloud service providers:</strong> Database and application servers are hosted in
					cloud services. Service providers may process data during technical maintenance.</li>
				</ul><br/>

				<strong>Occasional disclosures:</strong><br/>
				Data may be disclosed to authorities based on legal obligations.<br/><br/>

				<strong>Data security in transfers:</strong><br/>
				All data transfers occur using encrypted connections (HTTPS/TLS).
				Data is not sold, rented, or disclosed for marketing purposes.
			`,

			section8Title: "8. Principles of Register Protection",
			section8Content: `
				<strong>Technical safeguards:</strong><br/><br/>

				<ul>
					<li>Database is protected by firewall and access is restricted to authorized systems only</li>
					<li>All data traffic uses encrypted HTTPS connections</li>
					<li>Passwords and session tokens are stored hashed</li>
					<li>System uses secure session management</li>
					<li>Regular security backups</li>
				</ul><br/>

				<strong>Organizational safeguards:</strong><br/><br/>

				<ul>
					<li>Access to the register is restricted to board members and authorized administrators</li>
					<li>Access rights are granted only to the extent required by the task</li>
					<li>Log records of access right usage</li>
					<li>Personnel are trained in data protection and committed to confidentiality</li>
				</ul><br/>

				<strong>Physical security:</strong><br/>
				Servers are located in professionally managed data centers that meet high security requirements.
			`,

			section9Title: "9. Right of Access and Right to Rectification",
			section9Content: `
				<strong>Right of access:</strong><br/>
				Every data subject has the right to check what information about them has been stored in the
				personal data register. Access requests should be sent in writing to hallitus@tietokilta.fi.<br/><br/>

				<strong>Right to rectification:</strong><br/>
				Data subjects can correct and update their information by logging into the system.
				If information cannot be corrected by the data subject, they can request correction by
				contacting hallitus@tietokilta.fi.<br/><br/>

				<strong>Right to erasure:</strong><br/>
				Data subjects have the right to request deletion of their data ("right to be forgotten"),
				unless there is a legal basis for retaining the data (e.g., accounting obligations).
			`,

			section10Title: "10. Other Rights Related to Personal Data Processing",
			section10Content: `
				Data subjects have the right to:<br/><br/>

				<ul>
					<li><strong>Request restriction of processing</strong> in certain situations
					(e.g., when the lawfulness of processing is disputed)</li>

					<li><strong>Object to processing</strong> of their data when processing is based on
					legitimate interest</li>

					<li><strong>Data portability</strong> - transfer their data to another controller in a
					machine-readable format</li>

					<li><strong>Withdraw consent</strong> at any time when processing is based on consent
					(e.g., receiving marketing communications)</li>

					<li><strong>Lodge a complaint with a supervisory authority</strong> if they believe that
					the processing of their personal data violates data protection regulation</li>
				</ul><br/>

				<strong>Supervisory authority in Finland:</strong><br/>
				Office of the Data Protection Ombudsman<br/>
				Visiting address: Lintulahdenkuja 4, 00530 Helsinki<br/>
				Postal address: P.O. Box 800, 00531 Helsinki<br/>
				Phone: +358 29 56 66700<br/>
				Email: tietosuoja@om.fi<br/>
				Website: <a href="https://tietosuoja.fi/en/" target="_blank" rel="noopener noreferrer">https://tietosuoja.fi/en/</a>
			`,
		},

		footer: {
			privacyPolicy: "Privacy Policy",
			registryDisclosure: "Register Description",
			organization: "Computer Science Guild of Aalto University",
			businessId: "Business ID: 1888541-3",
			contact: "Contact",
			email: "hallitus@tietokilta.fi",
			phone: "+358 50 431 4761",
			address: "Konemiehentie 2, 02150 Espoo, Finland",
		},
	},
} satisfies Translation;

export default en;

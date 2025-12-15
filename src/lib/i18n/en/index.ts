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
		homeMunicipality: "Municipality of residence",
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
			homeMunicipality: "Municipality of residence: {homeMunicipality}",
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
			lastUpdated: "Last updated: December 15, 2025",

			section1Title: "1. Data Controller",
			section1Content: `
				<strong>Computer Science Guild of Aalto University (Tietokilta ry)</strong><br/>
				Business ID: 1790346-8<br/>
				Address: Konemiehentie 2, 02150 Espoo, Finland<br/>
				Email: hallitus@tietokilta.fi<br/>
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
					<li><strong>Membership-related information:</strong> Membership type, validity period, payment history, membership status, Stripe customer ID</li>
					<li><strong>Student status:</strong> Information regarding student status. Self-reported; may be verified via Aalto University email address.</li>
					<li><strong>Municipality of residence:</strong> Required under the Associations Act.</li>
					<li><strong>Consents:</strong> Information about whether the association may send non-membership emails</li>
					<li><strong>Passkeys:</strong> Public keys for passwordless authentication, device names, transport methods, sync status (e.g., iCloud Keychain), and last usage timestamps</li>
					<li><strong>Technical data:</strong> Session tokens, login codes, audit logs (retained for 90 days), IP addresses and browser information (user agent) from login attempts and administrative actions (for abuse and attack monitoring, retained for 90 days), rate limiting data (in memory only)</li>
				</ul>
			`,

			section6Title: "6. Regular Sources of Data",
			section6Content: `
				Data is primarily obtained from the members themselves during the application process or when updating their information.
				Payment-related data is obtained from the Stripe payment system.
			`,

			section7Title: "7. Data Retention Period",
			section7Content: `
				We retain data only for as long as necessary. Retention periods are determined as follows:<br/><br/>

				<strong>Incomplete registrations:</strong><br/>
				Login codes expire in 10 minutes. No personal data is retained if the registration is not completed.<br/><br/>

				<strong>Technical logs:</strong><br/>
				Login codes (10 min), session tokens (30 days), IP addresses and audit logs (90 days).<br/><br/>

				<strong>Passkeys:</strong><br/>
				Retained until deleted by the user or the account is removed.<br/><br/>

				<strong>Accounting records:</strong><br/>
				Payments, invoices, and receipts are retained for at least 6 years from the end of the fiscal year,
				as required by the Accounting Act.<br/><br/>

				<strong>Member registry data:</strong><br/>
				Retained for the duration of membership and subsequently as required to fulfill statutory obligations
				(Associations Act), after which data is anonymized or deleted.
			`,

			section8Title: "8. Data Disclosure and Transfers",
			section8Content: `
				We use trusted service providers for data processing:<br/><br/>

				<ul>
					<li><strong>Microsoft Azure (North Europe, Ireland):</strong> Cloud hosting for the database
					and application. Data remains within the EU.</li>

					<li><strong>Stripe (EU infrastructure):</strong> Payment processing. We only store the Stripe
					customer ID and email; Stripe handles all payment card data.</li>

					<li><strong>Mailgun (EU endpoint):</strong> Email delivery service. Data is processed within the EU.</li>

					<li><strong>Google Workspace (Google Groups):</strong> Used for mailing lists.</li>
				</ul>
				<br/>

				Generally, data is stored within the EU. If a service provider (e.g., Google) processes data outside
				the EU/EEA, the transfer is secured using appropriate safeguards, such as the EU Commission's
				Standard Contractual Clauses (SCCs). Data is not sold or disclosed to third parties for marketing purposes.
			`,

			section9Title: "9. Automated Decision-Making",
			section9Content: `
				The register does not use automated decision-making or profiling as defined in GDPR Article 22.
				All membership-related decisions (e.g., approval of membership applications) are made by a human.
			`,
		},

		registryDisclosure: {
			title: "Register Description",
			lastUpdated: "Last updated: December 15, 2025",

			section1Title: "1. Data Controller",
			section1Content: `
				<strong>Computer Science Guild of Aalto University (Tietokilta ry)</strong><br/>
				Business ID: 1790346-8<br/>
				Address: Konemiehentie 2, 02150 Espoo, Finland<br/>
				Email: hallitus@tietokilta.fi<br/>
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
					<li>Municipality of residence</li>
				</ul><br/>

				<strong>Membership information:</strong><br/>
				<ul>
					<li>Membership type (e.g., regular member, alumni member)</li>
					<li>Start and end dates of membership</li>
					<li>Membership status (e.g., active, expired, pending approval)</li>
					<li>Student status (self-reported; may be verified via Aalto University email address)</li>
					<li>Payment history and payment information</li>
					<li>Stripe customer ID</li>
				</ul><br/>

				<strong>Consents:</strong><br/>
				<ul>
					<li>Reception of non-membership related emails</li>
				</ul><br/>

				<strong>Passkeys:</strong><br/>
				<ul>
					<li>Public keys for passwordless authentication</li>
					<li>Device name (user-provided)</li>
					<li>Passkey transport methods (e.g., USB, NFC, Bluetooth)</li>
					<li>Sync status (e.g., backed up to iCloud Keychain)</li>
					<li>Last usage timestamp</li>
					<li>Creation and update timestamps</li>
				</ul><br/>

				<strong>Technical data:</strong><br/>
				<ul>
					<li>Session tokens for authentication</li>
					<li>Login codes and their expiration times</li>
					<li>Audit logs of administrative actions (retained for 90 days)</li>
					<li>IP addresses from login attempts and administrative actions (for abuse and attack monitoring, retained for 90 days)</li>
					<li>Browser information (user agent) from login attempts and administrative actions (retained for 90 days)</li>
					<li>Rate limiting data to prevent overload (in memory only)</li>
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
				</ul><br/>

				<strong>Student status:</strong> Self-reported. May be verified via Aalto University email address.
			`,

			section6Title: "6. Data Retention Period",
			section6Content: `
				Data is deleted as soon as it is no longer needed.<br/><br/>

				<strong>Technical Data:</strong><br/>
				<ul>
					<li>Login codes: expire automatically in 10 minutes.</li>
					<li>Session tokens: expire automatically in 30 days.</li>
					<li>Passkeys: retained until deleted by the user or the account is removed.</li>
					<li>IP addresses, browser info, and audit logs: deleted after 90 days.</li>
					<li>Incomplete registrations: No personal data is retained if the process is not completed.</li>
				</ul><br/>

				<strong>Statutory Retention Obligations:</strong><br/>
				<ul>
					<li><strong>Accounting Act:</strong> Payment records and receipts are retained for at least 6 years
					from the end of the fiscal year, as required by law.</li>
					<li><strong>Associations Act:</strong> Member data is retained to fulfill legal obligations,
					after which it is anonymized or deleted.</li>
					<li><strong>Statistics:</strong> May be anonymized and retained for historical purposes.</li>
				</ul>
			`,

			section7Title: "7. Data Disclosure and Transfers",
			section7Content: `
				<strong>Regular disclosures:</strong><br/>
				<ul>
					<li><strong>Microsoft Azure (Ireland):</strong> Hosting provider. Data stored in the EU.</li>
					<li><strong>Stripe (EU):</strong> Payment processing. We do not store card details. Stripe complies with GDPR.</li>
					<li><strong>Mailgun (EU):</strong> Email service. Data processed in the EU.</li>
					<li><strong>Google Workspace:</strong> Mailing lists. Google may process data outside the EU using
					appropriate safeguards (Standard Contractual Clauses).</li>
				</ul><br/>

				<strong>Transfer security:</strong><br/>
				All transfers use encrypted connections (HTTPS/TLS). Data is not sold or used for marketing by third parties.
			`,

			section8Title: "8. Principles of Register Protection",
			section8Content: `
				<strong>Technical safeguards:</strong><br/>
				<ul>
					<li>Database protected by firewall; access restricted to authorized systems.</li>
					<li>Encrypted traffic (HTTPS/TLS).</li>
					<li>No passwords stored (email-based OTP and Passkeys used).</li>
					<li>Session tokens are hashed.</li>
					<li>Comprehensive audit logging of administrative actions.</li>
					<li>Regular automated backups.</li>
				</ul><br/>

				<strong>Organizational safeguards:</strong><br/>
				<ul>
					<li>Access restricted to key board members (Chair, Secretary, Treasurer, System Admins).</li>
					<li>Access granted only as required by specific tasks.</li>
					<li>Board members are bound by confidentiality agreements.</li>
				</ul><br/>

				<strong>Physical security:</strong><br/>
				Servers located in Microsoft Azure North Europe (Ireland) data center (ISO 27001, SOC 2 compliant).
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

			section11Title: "11. Automated Decision-Making",
			section11Content: `
				The register does not use automated decision-making or profiling as defined in GDPR Article 22.
				All membership-related decisions (e.g., approval of membership applications) are made by a human.
			`,
		},

		footer: {
			version: "Version",
			privacyPolicy: "Privacy Policy",
			registryDisclosure: "Register Description",
			organization: "Tietokilta ry",
			businessId: "Business ID: 1790346-8",
			contact: "Contact",
			email: "hallitus@tietokilta.fi",
			address: "Konemiehentie 2, 02150 Espoo, Finland",
		},
	},
} satisfies Translation;

export default en;

import type { Translation } from "../i18n-types";

const en = {
	// Application
	app: {
		title: "Membership Registry",
	},

	// Navigation
	nav: {
		title: "Navigation",
		dashboard: "Dashboard",
		membership: "Membership",
		settings: "Settings",
		profile: "Profile",
		passkeys: "Passkeys",
		emails: "Emails",
		admin: {
			title: "Admin",
			members: "Members",
			memberships: "Memberships",
			users: "Users",
		},
		signOut: "Sign out",
	},

	// Dashboard
	dashboard: {
		welcome: "Welcome, {name}!",
		membershipStatus: "Membership Status",
		noMembership: "No active membership",
		getFirstMembership: "Get your first membership",
		viewAll: "View all",
		purchaseNew: "Purchase new",
		renewMembership: "Renew membership",
		profileIncomplete: "Complete your profile",
		profileIncompleteDescription: "We need your name and home municipality to register your membership.",
		completeProfile: "Go to profile",
		paymentSuccess: "Payment successful!",
		paymentSuccessDescription: "Your membership will be updated shortly.",
	},

	// Settings
	settings: {
		title: "Settings",
		description: "Manage your profile and preferences",
		profile: {
			title: "Profile",
			description: "Personal information and preferences",
			emailManagement: "Emails are managed on the <>emails page<>.",
		},
		passkeys: {
			title: "Passkeys",
			description: "Manage your passkeys",
		},
		emails: {
			title: "Emails",
			description: "Manage secondary emails",
		},
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
			lastUsed: "last used",

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

	// Secondary Emails
	secondaryEmail: {
		// Page titles
		title: "Emails",
		manageDescription: "Manage emails for signing in and verifying membership",

		// Primary email
		primary: "Primary",
		primaryDescription: "This is your primary email address",

		// Add email
		addEmail: "Add email",
		adding: "Adding...",
		emailAddress: "Email address",
		emailPlaceholder: "teemu.teekkari@aalto.fi",
		addAndVerify: "Add and verify email",

		// Verification
		verifyTitle: "Verify your email",
		verifyDescription: "We sent an 8-digit code to {email}",
		code: "Verification code",
		verify: "Verify",
		resendCode: "Resend code",
		changeEmail: "Change email",

		// Status
		status: {
			verified: "Verified",
			unverified: "Unverified",
			expired: "Expired",
		},

		// Details
		verifiedAt: "Verified",
		expiresAt: "Expires",
		neverExpires: "Never expires",
		domain: "Domain",

		// Actions
		delete: "Delete email",
		deleteConfirm: "Are you sure you want to delete this email?",
		reverify: "Re-verify",
		verifyNow: "Verify now",
		makePrimary: "Make primary",
		makePrimaryConfirm:
			"Are you sure you want to make {email} your primary email address? Your current primary email will be moved to secondary emails.",

		// Messages
		addSuccess: "Verification code sent to {email}",
		verifySuccess: "Email verified successfully!",
		verifySuccessExpires: "Email verified! Expires on {date}",
		deleteSuccess: "Email deleted successfully",
		makePrimarySuccess: "Primary email changed successfully",
		expiredMessage: "Your Aalto email verification has expired",
		notVerifiedMessage: "Aalto email not verified",
		verifiedDomainEmail: "Aalto email verified",
		expiresOn: "expires on {date}",
		addDomainEmail: "Add {domain} email →",
		reverifyNow: "Re-verify now →",

		// Errors
		invalidEmail: "Invalid email address",
		emailExists: "This email is already registered",
		limitReached: "Maximum 10 secondary emails allowed",
		verificationFailed: "Invalid verification code",
		rateLimited: "Too many requests. Please try again later",

		// Empty state
		noEmails: "No secondary emails",
		noEmailsDescription: "Add a secondary email for signing in or verifying membership",

		// Info
		infoExpiring: "Aalto.fi emails expire after 6 months and need re-verification",
		infoGeneral: "Secondary emails can be used for signing in and verifying membership",
	},

	// Membership
	membership: {
		title: "Memberships",
		historyDescription: "View and manage your memberships",
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
		getStarted: "Purchase a membership to get started",
		currentMemberships: "Active memberships",
		pastMemberships: "Past memberships",

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

		users: {
			title: "Manage users",
			description: "Manage user accounts and administrators",
			adminsSection: "Administrators",
			usersSection: "Users",

			table: {
				search: "Search users...",
				id: "ID",
				email: "Email",
				name: "Name",
				role: "Role",
				lastSession: "Last session",
				actions: "Actions",
				active: "Active",
				sessionExpired: "Expired",
				promote: "Promote to admin",
				demote: "Remove admin",
				merge: "Merge users",
				noUsers: "No users",
				noResults: "No search results",
				showing: "Showing {current} of {total} users",
			},

			merge: {
				title: "Merge users",
				description:
					"Merge two user accounts into one. All data from the secondary user will be transferred to the primary user.",
				selectSecondary: "Select user to merge",
				selectSecondaryPlaceholder: "Search users by email or name...",
				step1Title: "Step 1: Select user to merge",
				step2Title: "Step 2: Review data to merge",
				step3Title: "Step 3: Confirm merge",
				primaryUser: "Primary user (will be kept)",
				secondaryUser: "Secondary user (will be deleted)",
				willBeMerged: "Data to be merged:",
				memberships: "Memberships: {count} {{membership|memberships}}",
				secondaryEmails: "Secondary emails: {count}",
				passkeys: "Passkeys: {count}",
				sessions: "Active sessions",
				primaryEmailWillBecome: "Secondary user's email will become a secondary email",
				confirmByTyping: "Confirm by typing both email addresses:",
				irreversibleWarning:
					"This action cannot be undone. The secondary user account will be permanently deleted and all data will be transferred to the primary user.",
				typePrimaryEmail: "Type primary user's email",
				typeSecondaryEmail: "Type secondary user's email",
				cancel: "Cancel",
				next: "Next",
				previous: "Previous",
				mergeUsers: "Merge users",
				merging: "Merging...",
				success: "Users merged successfully!",
				overlappingMembershipsError: "Merge failed: both users have memberships for the same period",
				noOverlappingMemberships: "No overlapping memberships - merge is safe",
				checkingMemberships: "Checking memberships...",
			},
		},
	},

	// Common
	common: {
		save: "Save",
		delete: "Delete",
	},

	// Error page
	error: {
		title: "Oops! Something went wrong",
		notFound: "Page not found",
		notFoundDescription: "The page you're looking for doesn't exist or has been moved.",
		serverError: "Server error",
		genericError: "An error occurred",
		errorCode: "Error code: {code}",
		backToHome: "Back to home",
		tryAgain: "Try again",
	},

	// Documents & Legal
	documents: {
		memberRegistryPrivacy: {
			title: "Member Registry Privacy Statement",
			intro: `This is a registry and privacy statement in accordance with the EU General Data Protection
				Regulation (GDPR) and the Finnish Associations Act (503/1989).<br/><br/>
				<em>Note: The legally binding version of this document is in Finnish. This English translation
				is provided for convenience only.</em>`,
			createdDate: "Created: May 22, 2018",
			lastUpdated: "Last updated: January 8, 2026",

			section1Title: "1. Data Controller",
			section1Content: `
				<strong>Computer Science Guild of Aalto University (Tietokilta ry)</strong><br/>
				Business ID: 1790346-8<br/>
				Address: Konemiehentie 2, 02150 Espoo, Finland<br/>
				Email: hallitus@tietokilta.fi
			`,

			section2Title: "2. Contact Person for Data Protection Matters",
			section2Content: `
				For data protection inquiries, please contact the board at hallitus@tietokilta.fi
			`,

			section3Title: "3. Name of the Register",
			section3Content: `
				Tietokilta Membership Registry
			`,

			section4Title: "4. Legal Basis and Purpose of Processing",
			section4Content: `
				<strong>Legal basis:</strong><br/>
				<ul>
					<li>Performance of membership agreement (GDPR 6(1)(b))</li>
					<li>Legal obligation – Associations Act (GDPR 6(1)(c))</li>
					<li>Legitimate interest in organizing member activities (GDPR 6(1)(f))</li>
					<li>Consent for voluntary marketing communications (GDPR 6(1)(a))</li>
				</ul><br/>

				<strong>Purpose of processing:</strong><br/>
				<ul>
					<li>Maintaining and managing memberships</li>
					<li>Processing membership fees</li>
					<li>Communication with members (events, newsletters, member benefits)</li>
					<li>Fulfilling the association's legal obligations</li>
					<li>Providing authentication services for other guild digital services</li>
				</ul>
			`,

			section5Title: "5. Data Content of the Register",
			section5Content: `
				<strong>Member basic information:</strong><br/>
				<ul>
					<li>First name and last name</li>
					<li>Email address</li>
					<li>Municipality of residence (required by Associations Act)</li>
					<li>Preferred language (optional)</li>
				</ul><br/>

				<strong>Membership information:</strong><br/>
				<ul>
					<li>Membership type (e.g., regular member, alumni member), start/end dates, status</li>
					<li>Student status (self-reported; may be verified via Aalto email)</li>
					<li>Payment history, Stripe customer ID</li>
				</ul><br/>

				<strong>Consents:</strong><br/>
				<ul>
					<li>Reception of non-membership related emails</li>
				</ul><br/>

				<strong>Passkeys:</strong><br/>
				<ul>
					<li>Public keys for passwordless authentication</li>
					<li>Device name, transport methods, sync status</li>
					<li>Last usage timestamp</li>
				</ul><br/>

				<strong>Secondary email addresses (optional):</strong><br/>
				<ul>
					<li>Additional email addresses for alternative sign-in</li>
					<li>Email domain (e.g., aalto.fi)</li>
					<li>Verification status and timestamp</li>
					<li>Expiration date for domain-verified emails</li>
				</ul>
				<em>Note: Secondary emails are entirely optional, except for aalto.fi email verification
				which is required for certain membership types (e.g., student membership).</em><br/><br/>

				<strong>Technical data:</strong><br/>
				<ul>
					<li>Session tokens, login codes</li>
					<li>Audit logs of administrative actions (90 days)</li>
					<li>IP addresses and browser information from login attempts (90 days)</li>
					<li>Rate limiting data (in memory only)</li>
				</ul>
			`,

			section6Title: "6. Regular Sources of Data",
			section6Content: `
				Personal data is primarily collected from the member themselves:<br/>
				<ul>
					<li>Membership application and purchase</li>
					<li>Updating member information in the system</li>
					<li>Logging into the system</li>
				</ul><br/>

				Additionally, data is obtained from:<br/>
				<ul>
					<li>Stripe payment system (payment transactions)</li>
				</ul>
			`,

			section7Title: "7. Data Retention Period",
			section7Content: `
				We delete data as soon as it is no longer needed.<br/><br/>

				<strong>Incomplete registrations:</strong><br/>
				No personal data is retained for users who do not complete the registration process.
				Login codes expire automatically in 10 minutes.<br/><br/>

				<strong>Technical data:</strong><br/>
				<ul>
					<li>Login codes: 10 minutes</li>
					<li>Session tokens: 30 days</li>
					<li>Passkeys: until deleted by user or account is removed</li>
					<li>Secondary emails: until deleted by user or account is removed</li>
					<li>Aalto.fi email verification: valid for 6 months, then requires re-verification</li>
					<li>IP addresses, browser info, audit logs: 90 days</li>
					<li>Rate limiting data: in memory only</li>
				</ul><br/>

				<strong>Statutory retention obligations:</strong><br/>
				<ul>
					<li><strong>Accounting Act:</strong> Payments, invoices, and receipts for at least 6 years from end of fiscal year</li>
					<li><strong>Associations Act:</strong> Member data retained to fulfill legal obligations</li>
				</ul><br/>

				<strong>In practice after membership ends:</strong> Technical data is automatically deleted when it
				expires. Member registry data and accounting records are retained in accordance with statutory obligations.
			`,

			section8Title: "8. Data Disclosure and Transfers",
			section8Content: `
				<table>
					<thead>
						<tr>
							<th>Service Provider</th>
							<th>Location</th>
							<th>Purpose</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>Microsoft Azure</td>
							<td>EU (Ireland)</td>
							<td>Database and application</td>
						</tr>
						<tr>
							<td>Stripe</td>
							<td>EU</td>
							<td>Payment processing</td>
						</tr>
						<tr>
							<td>Mailgun</td>
							<td>EU</td>
							<td>Email service</td>
						</tr>
						<tr>
							<td>Google Workspace</td>
							<td>EU/Global*</td>
							<td>Mailing lists</td>
						</tr>
					</tbody>
				</table>
				<p class="text-sm">*Google may process data outside the EU using Standard Contractual Clauses (SCCs).</p><br/>

				<strong>Other Tietokilta services:</strong><br/>
				With the member's consent, the registry may be used for authentication in other
				digital services provided by the guild. In such cases, only necessary data
				(e.g., name, email, membership status) is disclosed to the service.<br/><br/>

				<strong>Occasional disclosures:</strong><br/>
				Data may be disclosed to authorities based on statutory obligations.<br/><br/>

				<strong>Transfer security:</strong><br/>
				All transfers use encrypted connections (HTTPS/TLS).
				Data is not sold, rented, or disclosed for marketing purposes.
			`,

			section9Title: "9. Principles of Register Protection",
			section9Content: `
				<strong>Technical safeguards:</strong><br/>
				<ul>
					<li>Database protected by firewall; access restricted to authorized systems</li>
					<li>All traffic encrypted (HTTPS/TLS)</li>
					<li>No passwords – email-based OTP and passkeys used</li>
					<li>Session tokens stored hashed</li>
					<li>Comprehensive audit logging of administrative actions</li>
					<li>Regular automated backups</li>
				</ul><br/>

				<strong>Organizational safeguards:</strong><br/>
				<ul>
					<li>Access restricted to key board members (Chair, Secretary, Treasurer, System Admins)</li>
					<li>Access granted only as required by specific tasks</li>
					<li>All administrative actions recorded in audit log</li>
				</ul><br/>

				<strong>Physical security:</strong><br/>
				Servers located in Microsoft Azure North Europe (Ireland) data center (ISO 27001, SOC 2).
			`,

			section10Title: "10. Data Subject Rights",
			section10Content: `
				Data subjects have the right to:<br/>
				<ul>
					<li>Access their personal data</li>
					<li>Request rectification of their data</li>
					<li>Restrict or object to processing</li>
					<li>Data portability</li>
					<li>Withdraw consent</li>
					<li>Lodge a complaint with the Data Protection Ombudsman (<a href="https://tietosuoja.fi/en/" target="_blank" rel="noopener noreferrer">tietosuoja.fi</a>)</li>
				</ul><br/>

				<strong>⚠️ Note on data erasure:</strong><br/>
				The Finnish Associations Act (503/1989 § 11) requires associations to maintain a member registry.
				This statutory obligation takes precedence over GDPR erasure rights.
			`,

			section11Title: "11. Right of Access and Rectification",
			section11Content: `
				<strong>Right of access:</strong><br/>
				Members can view and manage their own data by signing into the system.
				Technical data (sessions, logs, IP addresses) can be requested separately at
				hallitus@tietokilta.fi.<br/><br/>

				<strong>Right to rectification:</strong><br/>
				Data subjects can correct and update their information by logging into the system.
				If information cannot be corrected by the data subject, they can request correction by
				contacting hallitus@tietokilta.fi.<br/><br/>

				<strong>Supervisory authority in Finland:</strong><br/>
				Office of the Data Protection Ombudsman<br/>
				Visiting address: Lintulahdenkuja 4, 00530 Helsinki<br/>
				Postal address: P.O. Box 800, 00531 Helsinki<br/>
				Phone: +358 29 56 66700<br/>
				Email: tietosuoja@om.fi<br/>
				Website: <a href="https://tietosuoja.fi/en/" target="_blank" rel="noopener noreferrer">https://tietosuoja.fi/en/</a>
			`,

			section12Title: "12. Automated Decision-Making",
			section12Content: `
				The register does not use automated decision-making or profiling as defined in GDPR Article 22.
				All membership-related decisions (e.g., approval of membership applications) are made by a human.
			`,
		},

		footer: {
			version: "Version",
			privacyPolicy: "Privacy Statement",
			organization: "Tietokilta ry",
			businessId: "Business ID: 1790346-8",
			contact: "Contact",
			email: "hallitus@tietokilta.fi",
			address: "Konemiehentie 2, 02150 Espoo, Finland",
		},
	},
} satisfies Translation;

export default en;

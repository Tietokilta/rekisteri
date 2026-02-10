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
      membershipTypes: "Membership Types",
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
    completePayment: "Complete payment",
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
    noEmailFound: "No email found",
    incorrectCode: "Incorrect code.",
    codeExpiredResent: "The verification code was expired. We sent another code to your inbox.",
    codeSent: "A new code was sent to your inbox.",
    emailNotFound: "Email not found",

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

      // Server errors
      tooManyAttempts: "Too many authentication attempts. Please try again later.",
      failedGenerateAuthOptions: "Failed to generate authentication options",
      noAuthChallenge: "No authentication challenge found. Please start authentication again.",
      failedVerifyAuth: "Failed to verify authentication",
      failedGenerateRegOptions: "Failed to generate registration options",
      noRegChallenge: "No registration challenge found. Please start registration again.",
      failedVerifyReg: "Failed to verify passkey registration",
      failedList: "Failed to list passkeys",
      notFound: "Passkey not found or does not belong to user",

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

  // Emails
  emails: {
    otp: {
      subject: "CSG Membership Registry Sign In Code",
    },
    paymentSuccess: {
      subject: "Payment received - Awaiting board approval",
      body: `Thank you for your {membershipName} membership payment ({amount})!

Your payment has been received and your membership application is awaiting approval at the next board meeting.

You will receive an email once your membership is approved.

Best regards,
Computer Science Guild`,
    },
    membershipApproved: {
      subject: "Welcome to the Computer Science Guild!",
      body: `Hi {firstName}!

Your membership application has been approved. Welcome as a member of the Computer Science Guild!

Membership details:
- Type: {membershipName}
- Valid: {startDate} - {endDate}

You can now participate in guild activities and enjoy member benefits.

See you at events!

Best regards,
Computer Science Guild`,
    },
    membershipRenewed: {
      subject: "Your membership has been renewed!",
      body: `Hi {firstName}!

Your membership has been automatically renewed after payment.

Membership details:
- Type: {membershipName}
- Valid: {startDate} - {endDate}

Thank you for continuing as a member!

Best regards,
Computer Science Guild`,
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
    couldNotAdd: "Could not add this email. Please try a different email address.",
    emailNotFound: "Email not found",
    couldNotChangePrimary: "Could not change primary email. Email must be verified and not expired.",
    tooManyAttempts: "Too many attempts. Please try again later.",

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
    description: "Motivation for applying for membership",
    descriptionPlaceholder: "Describe why you are applying for membership...",
    descriptionRequired: "Motivation for applying for membership is required",
    getStarted: "Purchase a membership to get started",
    currentMemberships: "Active memberships",
    pastMemberships: "Past memberships",
    moreInfoInBylaws: "More information about memberships in the guild bylaws",
    alreadyHaveMembershipForPeriod: "You already have a membership for this period",
    noAvailableMemberships:
      "No memberships available for purchase. You already have a membership for all available periods.",
    willAutoApprove: "Will be automatically approved after payment",
    willRequireApproval: "Will require board approval after payment",
    autoApprovalAdminNote:
      "Members who had an approved membership of the same type in the immediately preceding period will be automatically approved upon renewal. For student memberships, a valid aalto.fi email is also required.",
    studentVerificationRequired: "Student verification required. Please add and verify your Aalto email address.",
    paymentSessionFailed: "Could not create payment session",

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
      editMembership: "Edit membership",
      stripePriceId: "Stripe price ID",
      stripePriceIdDescription: "Price ID found on Stripe dashboard",
      stripePriceIdLabel: "Price ID {stripePriceId}",
      fetchingStripeMetadata: "Fetching Stripe data...",
      stripeMetadataPreview: "Stripe information:",
      productName: "Product name",
      priceNickname: "Price nickname",
      amount: "Amount",
      priceInactive: "Warning: This price is inactive in Stripe",
      legacyMembership: "Legacy membership (no Stripe price)",
      failedToLoadPrice: "Failed to load price",
    },

    membershipTypes: {
      title: "Manage membership types",
      description: "Create and edit membership types",
      createNew: "Create new type",
      createDescription: "Create a new membership type that can be used for memberships",
      editType: "Edit membership type",
      noTypes: "No membership types",
      id: "ID",
      idDescription: "Unique identifier (used internally). Use lowercase letters, numbers, and hyphens.",
      idCannotChange: "ID cannot be changed after creation",
      nameFi: "Name (Finnish)",
      nameEn: "Name (English)",
      descriptionFi: "Description (Finnish, optional)",
      descriptionEn: "Description (English, optional)",
      descriptionPlaceholder: "Optional description for the membership type...",
      cannotDeleteInUse: "Cannot delete membership type that has memberships",
      idAlreadyExists: "A membership type with this ID already exists",
      membershipTypeNotFound: "Membership type not found",
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
        descriptionLabel: "Motivation:",

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

        // Bulk actions
        selectAll: "Select all",
        selectRow: "Select row",
        selectedCount: "{count} selected",
        bulkApprove: "Approve ({count})",
        bulkReject: "Reject ({count})",
        bulkMarkExpired: "Mark as Expired ({count})",
        bulkCancel: "Cancel ({count})",
        bulkReactivate: "Reactivate ({count})",
        clearSelection: "Clear selection",
      },

      // Server errors
      memberNotFound: "Member not found",
      notAwaitingApproval: "Member is not awaiting approval",
      cannotReactivate: "Only expired or cancelled memberships can be reactivated",
      noMembersAwaitingApproval: "No members are awaiting approval",
      noMembersCanBeExpired: "No members can be marked as expired",
      noMembersCanBeCancelled: "No members can be cancelled",
      noMembersCanBeReactivated: "No members can be reactivated",
    },

    import: {
      title: "Import members",
      description: "Import members from CSV file",
      step1: "1. Upload CSV File",
      step2: "2. Review & Resolve",
      step3: "3. Import",
      csvFile: "CSV File",
      expectedColumns: "Expected columns:",
      existingMemberships: "Existing memberships in database:",
      matchNote: "CSV rows are matched by type + start date. Missing memberships can be created below.",
      availableTypeIds: "Available membership type IDs:",
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
      // Analysis categories
      matched: "Matched",
      matchedDesc: "{count} {{row|rows}} matched to existing memberships",
      unmatched: "Needs Resolution",
      unmatchedDesc: "{count} {{row|rows}} need membership resolution",
      errors: "Errors",
      errorsDesc: "{count} {{row|rows}} have validation errors",
      // Unmatched resolution
      unmatchedMemberships: "Missing Memberships",
      unmatchedMembershipsDesc: "The following membership type + start date combinations don't exist in the database:",
      quickCreate: "Quick Create",
      quickCreateDesc: "Create as legacy membership (ends {endDate})",
      linkToExisting: "Link to existing",
      selectMembership: "Select membership...",
      createAllMissing: "Create All Missing Memberships",
      creating: "Creating...",
      created: "Created!",
      linked: "Linked",
      createFailed: "Failed to create membership",
      rowsAffected: "{count} {{row|rows}} affected",
      resolveToImport: "Resolve all unmatched rows to enable import",
      invalidDataFormat: "Invalid data format",
      csvColumnsMismatch: "CSV columns don't match expected: {columns}",
      invalidTypeIdsError: "Invalid membership type IDs: {invalidTypes}. Available IDs: {availableIds}",
      rowError: "Row {row}: {message}",
      rowErrorDetail: "Row {row} ({email}): {error}",
      or: "or",
      statusHeader: "Status",
      pending: "Pending",
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
        lastActive: "Last active",
        actions: "Actions",
        never: "Never",
        promote: "Promote to admin",
        demote: "Remove admin",
        merge: "Merge users",
        noUsers: "No users",
        noResults: "No search results",
        showing: "Showing {current} of {total} users",
      },

      // Server errors
      userNotFound: "User not found",
      alreadyAdmin: "User is already an admin",
      notAdmin: "User is not an admin",
      cannotDemoteSelf: "You cannot demote yourself",
      cannotDemoteLastAdmin: "Cannot demote the last admin",
      cannotMergeSelf: "Cannot merge a user with themselves",
      primaryUserNotFound: "Primary user not found",
      secondaryUserNotFound: "Secondary user not found",
      primaryEmailMismatch: "Primary email confirmation does not match",
      secondaryEmailMismatch: "Secondary email confirmation does not match",
      cannotMergeOverlapping:
        'Cannot merge: Both users have membership "{type}" for the same period ({startDate} - {endDate})',

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
        willBeMerged: "The following will be transferred to the primary user:",
        memberships: "All memberships",
        secondaryEmails: "All secondary emails",
        passkeys: "All passkeys",
        sessions: "All active sessions",
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
    deleteFailed: "Failed to delete",
    edit: "Edit",
    cancel: "Cancel",
    actions: "Actions",
    create: "Create",
    select: "Select",
    loading: "Loading...",
    optional: "optional",
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

    // Form/API validation errors
    notAuthenticated: "Not authenticated",
    tooManyRequests: "Too many requests",
    tooManyRequestsNetwork:
      "Too many requests. This could be due to network activity or multiple attempts. Try again later or from a different network.",
    unauthorized: "Unauthorized",
    resourceNotFound: "Not found",
    updateFailed: "Failed to update information",
  },

  // Documents & Legal
  documents: {
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

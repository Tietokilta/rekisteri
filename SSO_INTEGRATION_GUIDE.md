# SSO Integration Guide

This guide explains how to integrate `ilmo.tietokilta.fi` and `tietokilta.fi` with rekisteri's shared cookie SSO authentication.

## Overview

Rekisteri now functions as an authentication provider for other Tietokilta services using shared session cookies. All services under `*.tietokilta.fi` can:

1. Share authentication sessions via cookies
2. Validate user sessions
3. Fetch user information (email, name, membership status)
4. Redirect users for authentication

## Setup

### 1. Environment Configuration

In rekisteri's production environment, set:

```bash
COOKIE_DOMAIN=".tietokilta.fi"
```

This allows the `auth-session` cookie to be shared across all subdomains.

### 2. Available API Endpoints

- **`GET /api/auth/session`** - Validate session and get basic user info
- **`GET /api/auth/userinfo`** - Get detailed user info with membership status
- **`POST /api/auth/logout`** - Logout user across all services

---

## Integration: ilmo.tietokilta.fi

Ilmo needs to:

- Auto-fill email and names for sign-ups
- Validate membership status
- Show different UI/email if membership is missing

### Implementation

#### 1. Add Session Validation Middleware

Create `src/lib/server/auth.ts`:

```typescript
import type { Cookies } from "@sveltejs/kit";

const REKISTERI_URL = "https://rekisteri.tietokilta.fi";

interface UserInfo {
	sub: string;
	email: string;
	email_verified: boolean;
	given_name?: string;
	family_name?: string;
	home_municipality?: string;
	is_admin: boolean;
	is_allowed_emails: boolean;
	membership: {
		status: string;
		type: string;
		start_time: string;
		end_time: string;
		price_cents: number;
		requires_student_verification: boolean;
		is_valid: boolean;
	} | null;
	memberships: Array<{
		status: string;
		type: string;
		start_time: string;
		end_time: string;
		is_valid: boolean;
	}>;
}

// Cache to avoid hitting API on every request
const userCache = new Map<string, { data: UserInfo; expiresAt: number }>();

export async function getUserInfo(cookies: Cookies): Promise<UserInfo | null> {
	const sessionToken = cookies.get("auth-session");

	if (!sessionToken) {
		return null;
	}

	// Check cache first (5 minute TTL)
	const cached = userCache.get(sessionToken);
	if (cached && Date.now() < cached.expiresAt) {
		return cached.data;
	}

	try {
		const response = await fetch(`${REKISTERI_URL}/api/auth/userinfo`, {
			headers: {
				Cookie: `auth-session=${sessionToken}`,
			},
		});

		if (!response.ok) {
			userCache.delete(sessionToken);
			return null;
		}

		const data = await response.json();

		// Cache for 5 minutes
		userCache.set(sessionToken, {
			data,
			expiresAt: Date.now() + 5 * 60 * 1000,
		});

		return data;
	} catch (error) {
		console.error("Failed to fetch user info:", error);
		return null;
	}
}

export function hasActiveMembership(userInfo: UserInfo | null): boolean {
	return userInfo?.membership?.is_valid === true;
}

export function redirectToLogin(currentUrl: URL): Response {
	const returnTo = currentUrl.toString();
	const loginUrl = `${REKISTERI_URL}/fi/sign-in?return_to=${encodeURIComponent(returnTo)}`;
	return new Response(null, {
		status: 302,
		headers: {
			Location: loginUrl,
		},
	});
}
```

#### 2. Sign-up Form with Auto-fill

In your sign-up route (`src/routes/events/[id]/signup/+page.server.ts`):

```typescript
import type { PageServerLoad } from "./$types";
import { getUserInfo, hasActiveMembership, redirectToLogin } from "$lib/server/auth";

export const load: PageServerLoad = async ({ cookies, url, params }) => {
	// Fetch user info from rekisteri
	const userInfo = await getUserInfo(cookies);

	// Check membership status
	const hasMembership = hasActiveMembership(userInfo);

	// Get event details
	const event = await db.query.events.findFirst({
		where: eq(events.id, params.id),
	});

	return {
		event,
		userInfo,
		hasMembership,
		// Pre-fill form data
		formDefaults: userInfo
			? {
					email: userInfo.email,
					firstName: userInfo.given_name || "",
					lastName: userInfo.family_name || "",
				}
			: null,
	};
};
```

#### 3. Conditional UI Based on Membership

In your sign-up page component (`src/routes/events/[id]/signup/+page.svelte`):

```svelte
<script lang="ts">
	import { page } from "$app/stores";

	const { event, userInfo, hasMembership, formDefaults } = $page.data;
</script>

<h1>Sign up for {event.name}</h1>

{#if userInfo}
	<div class="user-info">
		<p>Signed in as: {userInfo.email}</p>

		{#if !hasMembership}
			<div class="warning-banner">
				⚠️ You don't have an active Tietokilta membership.
				<a href="https://rekisteri.tietokilta.fi/fi/new"> Purchase membership </a>
			</div>
		{/if}
	</div>
{/if}

<form method="POST">
	<label>
		Email
		<input type="email" name="email" value={formDefaults?.email || ""} required />
	</label>

	<label>
		First Name
		<input type="text" name="firstName" value={formDefaults?.firstName || ""} required />
	</label>

	<label>
		Last Name
		<input type="text" name="lastName" value={formDefaults?.lastName || ""} required />
	</label>

	{#if !hasMembership}
		<p class="non-member-notice">As a non-member, you may have different pricing or restricted access.</p>
	{/if}

	<button type="submit">
		Sign up {hasMembership ? "(Member)" : "(Non-member)"}
	</button>
</form>
```

#### 4. Send Different Emails Based on Membership

In your sign-up action:

```typescript
import type { Actions } from "./$types";
import { getUserInfo, hasActiveMembership } from "$lib/server/auth";
import { sendEmail } from "$lib/server/email";

export const actions: Actions = {
	default: async ({ request, cookies, params }) => {
		const userInfo = await getUserInfo(cookies);
		const hasMembership = hasActiveMembership(userInfo);

		const formData = await request.formData();
		const email = formData.get("email");
		const firstName = formData.get("firstName");
		const lastName = formData.get("lastName");

		// Create signup in database
		const signup = await db.insert(eventSignups).values({
			eventId: params.id,
			email,
			firstName,
			lastName,
			isMember: hasMembership,
			membershipType: userInfo?.membership?.type,
			userId: userInfo?.sub,
		});

		// Send appropriate email
		if (hasMembership) {
			await sendEmail({
				to: email,
				subject: "Event Registration Confirmed - Member",
				html: `
					<p>Hi ${firstName},</p>
					<p>Your registration has been confirmed!</p>
					<p><strong>Member pricing applies.</strong></p>
					<p>Membership: ${userInfo.membership.type}</p>
				`,
			});
		} else {
			await sendEmail({
				to: email,
				subject: "Event Registration Confirmed - Non-member",
				html: `
					<p>Hi ${firstName},</p>
					<p>Your registration has been confirmed!</p>
					<p><strong>Non-member pricing applies.</strong></p>
					<p>Consider <a href="https://rekisteri.tietokilta.fi/fi/new">becoming a member</a> for benefits!</p>
				`,
			});
		}

		return { success: true };
	},
};
```

#### 5. Optional: Require Login

If you want to require users to be logged in:

```typescript
export const load: PageServerLoad = async ({ cookies, url }) => {
	const userInfo = await getUserInfo(cookies);

	if (!userInfo) {
		return redirectToLogin(url);
	}

	// Rest of your load function
};
```

---

## Integration: tietokilta.fi

The main site needs to auto-fill email and names for sign-ups (e.g., newsletter, contact forms).

### Implementation

#### 1. Add Session Check

Create `src/lib/server/rekisteri.ts`:

```typescript
import type { Cookies } from "@sveltejs/kit";

const REKISTERI_URL = "https://rekisteri.tietokilta.fi";

interface UserInfo {
	email: string;
	given_name?: string;
	family_name?: string;
}

// Simple cache with 5-minute TTL
const cache = new Map<string, { data: UserInfo; expiresAt: number }>();

export async function getUserInfo(cookies: Cookies): Promise<UserInfo | null> {
	const sessionToken = cookies.get("auth-session");

	if (!sessionToken) {
		return null;
	}

	// Check cache
	const cached = cache.get(sessionToken);
	if (cached && Date.now() < cached.expiresAt) {
		return cached.data;
	}

	try {
		const response = await fetch(`${REKISTERI_URL}/api/auth/userinfo`, {
			headers: {
				Cookie: `auth-session=${sessionToken}`,
			},
		});

		if (!response.ok) {
			return null;
		}

		const data = await response.json();

		// Cache for 5 minutes
		cache.set(sessionToken, {
			data,
			expiresAt: Date.now() + 5 * 60 * 1000,
		});

		return data;
	} catch (error) {
		console.error("Failed to fetch user info:", error);
		return null;
	}
}
```

#### 2. Newsletter Sign-up with Auto-fill

In your newsletter form route (`src/routes/newsletter/+page.server.ts`):

```typescript
import type { PageServerLoad } from "./$types";
import { getUserInfo } from "$lib/server/rekisteri";

export const load: PageServerLoad = async ({ cookies }) => {
	const userInfo = await getUserInfo(cookies);

	return {
		// Pre-fill form if user is authenticated
		email: userInfo?.email || "",
		firstName: userInfo?.given_name || "",
		lastName: userInfo?.family_name || "",
		isAuthenticated: !!userInfo,
	};
};
```

In your newsletter form (`src/routes/newsletter/+page.svelte`):

```svelte
<script lang="ts">
	import { page } from "$app/stores";

	const { email, firstName, lastName, isAuthenticated } = $page.data;
</script>

<h2>Subscribe to our Newsletter</h2>

{#if isAuthenticated}
	<p class="info-message">✓ We've pre-filled your information from your Tietokilta account.</p>
{/if}

<form method="POST">
	<label>
		Email
		<input type="email" name="email" value={email} required />
	</label>

	<label>
		First Name
		<input type="text" name="firstName" value={firstName} />
	</label>

	<label>
		Last Name
		<input type="text" name="lastName" value={lastName} />
	</label>

	<button type="submit">Subscribe</button>
</form>
```

#### 3. Global Header with Login Status

In your root layout (`src/routes/+layout.server.ts`):

```typescript
import type { LayoutServerLoad } from "./$types";
import { getUserInfo } from "$lib/server/rekisteri";

export const load: LayoutServerLoad = async ({ cookies }) => {
	const userInfo = await getUserInfo(cookies);

	return {
		user: userInfo
			? {
					email: userInfo.email,
					name: [userInfo.given_name, userInfo.family_name].filter(Boolean).join(" "),
				}
			: null,
	};
};
```

In your header component:

```svelte
<script lang="ts">
	import { page } from "$app/stores";

	const user = $page.data.user;
</script>

<header>
	<nav>
		<a href="/">Home</a>
		<a href="/events">Events</a>

		{#if user}
			<div class="user-menu">
				<span>👤 {user.name || user.email}</span>
				<a href="https://rekisteri.tietokilta.fi/fi">My Account</a>
				<form method="POST" action="/logout">
					<button>Logout</button>
				</form>
			</div>
		{:else}
			<a href="https://rekisteri.tietokilta.fi/fi/sign-in">Login</a>
		{/if}
	</nav>
</header>
```

---

## Testing

### 1. Test Shared Cookie

1. Deploy rekisteri with `COOKIE_DOMAIN=".tietokilta.fi"`
2. Login at `rekisteri.tietokilta.fi`
3. Visit `ilmo.tietokilta.fi` or `tietokilta.fi`
4. Cookie should be present and session should be valid

Check in browser DevTools:

```
Application → Cookies → .tietokilta.fi
Should see: auth-session cookie
```

### 2. Test User Info API

```bash
# After logging in, copy session token from browser
curl -b "auth-session=<token>" \
  https://rekisteri.tietokilta.fi/api/auth/userinfo

# Should return user info with membership status
```

### 3. Test Return URL Flow

Visit ilmo sign-up page without being logged in:

```
https://ilmo.tietokilta.fi/events/123/signup
→ Should redirect to rekisteri login
→ After login, should redirect back to ilmo
→ Form should be pre-filled with user data
```

---

## Security Notes

1. **HTTPS Required**: Cookie sharing only works over HTTPS in production
2. **Cookie Domain**: Must be set to `.tietokilta.fi` (note the leading dot)
3. **Return URL Validation**: Rekisteri validates that return URLs are on `*.tietokilta.fi`
4. **Cache TTL**: 5-minute cache reduces API load but may delay membership updates
5. **Session Validation**: Always validate server-side, never trust client

---

## Membership Status Values

Users can have the following membership statuses:

- `awaiting_payment` - Checkout initiated but not paid
- `awaiting_approval` - Paid but requires manual approval (student verification)
- `active` - Paid and approved
- `expired` - Membership period has ended
- `cancelled` - Membership was cancelled

For most purposes, only check:

```typescript
userInfo.membership?.is_valid === true;
```

This ensures the membership is:

- Status is `active`
- Current date is within `start_time` and `end_time`

---

## Common Questions

### Q: Do users need to re-authenticate?

Yes, when you first deploy with `COOKIE_DOMAIN`, existing sessions will not have the shared domain. Users will need to log in again once.

### Q: Can I cache user info longer than 5 minutes?

Yes, but be aware that membership status changes (purchases, expirations) won't be reflected until cache expires.

### Q: What if rekisteri is down?

Your service should gracefully handle API failures and continue working without user info. Pre-filling just won't work, but forms should still function.

### Q: Should I store user data in my database?

You can store the `sub` (user ID) to link records, but fetch fresh data from rekisteri for each session to ensure accuracy.

### Q: How do I handle logout?

You can either:

1. Call rekisteri's `/api/auth/logout` endpoint to logout everywhere
2. Just clear the cookie locally (user stays logged in elsewhere)

Example global logout:

```typescript
export const actions: Actions = {
	logout: async ({ cookies, fetch }) => {
		const sessionToken = cookies.get("auth-session");

		if (sessionToken) {
			await fetch("https://rekisteri.tietokilta.fi/api/auth/logout", {
				method: "POST",
				headers: {
					Cookie: `auth-session=${sessionToken}`,
				},
			});
		}

		redirect(302, "/");
	},
};
```

---

## Support

For issues or questions:

- Check rekisteri logs for API errors
- Verify `COOKIE_DOMAIN` is set correctly
- Test API endpoints manually with curl
- Check browser DevTools for cookie presence/domain

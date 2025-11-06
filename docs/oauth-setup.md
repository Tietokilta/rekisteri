# OAuth 2.0 / OpenID Connect Provider Setup

Rekisteri can function as an OAuth 2.0 and OpenID Connect provider, allowing other Tietokilta services to use "Sign in with Rekisteri" functionality.

## Overview

The OAuth implementation provides:
- **Authorization Code Flow** - Standard OAuth 2.0 flow for web applications
- **Refresh Tokens** - Long-lived tokens for maintaining sessions
- **OpenID Connect** - ID tokens with user claims
- **Auto-approval** - Trusted clients are automatically approved (no consent screen)
- **Environment-based configuration** - Clients configured via environment variables (Terraform-friendly)

## Architecture

### Endpoints

- `GET /oauth/authorize` - Authorization endpoint (initiates login)
- `POST /oauth/token` - Token exchange endpoint
- `GET /oauth/userinfo` - User information endpoint
- `GET /.well-known/openid-configuration` - OpenID Connect discovery
- `GET /.well-known/jwks.json` - Public keys for JWT verification

### Database Tables

- `oauth_authorization_code` - Short-lived authorization codes (10 minutes)
- `oauth_token` - Refresh tokens (30 days)

Access tokens are **stateless JWTs** and are not stored in the database.

### User Claims

Standard OpenID Connect claims:
- `sub` - User ID
- `email` - Email address
- `name` - Full name
- `given_name` - First name
- `family_name` - Last name

Custom claims:
- `home_municipality` - User's home municipality
- `is_admin` - Admin status
- `membership_status` - Current membership status (active, expired, etc.)
- `membership_type` - Membership type name
- `membership_expires` - Membership expiration date (ISO 8601)

## Setup Instructions

### 1. Generate RSA Key Pair

OAuth uses RS256 (RSA with SHA-256) for signing JWT tokens. Generate a key pair:

```bash
# Generate private key (2048 bits)
openssl genrsa -out oauth-private-key.pem 2048

# Extract public key
openssl rsa -in oauth-private-key.pem -pubout -out oauth-public-key.pem

# View private key (copy this to environment variable)
cat oauth-private-key.pem

# View public key (copy this to environment variable)
cat oauth-public-key.pem
```

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# OAuth Private Key (entire PEM file including headers)
OAUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
...
-----END PRIVATE KEY-----"

# OAuth Public Key (entire PEM file including headers)
OAUTH_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAr3...
...
-----END PUBLIC KEY-----"

# OAuth Clients (JSON array)
OAUTH_CLIENTS='[
  {
    "id": "events-platform",
    "secret": "your-secure-random-secret-here",
    "name": "Tietokilta Events Platform",
    "redirectUris": [
      "https://events.tietokilta.fi/auth/callback",
      "http://localhost:3001/auth/callback"
    ]
  },
  {
    "id": "room-booking",
    "secret": "another-secure-random-secret",
    "name": "Room Booking System",
    "redirectUris": [
      "https://booking.tietokilta.fi/auth/callback",
      "http://localhost:3002/auth/callback"
    ]
  }
]'
```

**Important Notes:**
- Keep private keys **secret** - never commit to version control
- Use strong random secrets for client credentials (32+ characters)
- Redirect URIs must match **exactly** (including trailing slashes)
- Multiple redirect URIs allow for development and production environments

### 3. Terraform Configuration Example

```hcl
# Generate secure client secrets
resource "random_password" "events_oauth_secret" {
  length  = 32
  special = false
}

resource "random_password" "booking_oauth_secret" {
  length  = 32
  special = false
}

# OAuth clients configuration
locals {
  oauth_clients = [
    {
      id           = "events-platform"
      secret       = random_password.events_oauth_secret.result
      name         = "Events Platform"
      redirectUris = [
        "https://events.tietokilta.fi/auth/callback",
        "http://localhost:3001/auth/callback"
      ]
    },
    {
      id           = "room-booking"
      secret       = random_password.booking_oauth_secret.result
      name         = "Room Booking System"
      redirectUris = [
        "https://booking.tietokilta.fi/auth/callback",
        "http://localhost:3002/auth/callback"
      ]
    }
  ]
}

# Pass to rekisteri via Kubernetes secret
resource "kubernetes_secret" "rekisteri_oauth" {
  metadata {
    name      = "rekisteri-oauth"
    namespace = "tietokilta"
  }

  data = {
    OAUTH_CLIENTS      = jsonencode(local.oauth_clients)
    OAUTH_PRIVATE_KEY  = file("${path.module}/secrets/oauth-private-key.pem")
    OAUTH_PUBLIC_KEY   = file("${path.module}/secrets/oauth-public-key.pem")
  }
}

# Pass client credentials to each service
resource "kubernetes_secret" "events_oauth" {
  metadata {
    name      = "events-oauth"
    namespace = "tietokilta"
  }

  data = {
    OAUTH_CLIENT_ID     = "events-platform"
    OAUTH_CLIENT_SECRET = random_password.events_oauth_secret.result
    OAUTH_ISSUER        = "https://rekisteri.tietokilta.fi"
  }
}
```

### 4. Update Database Schema

Push the new OAuth tables to your database:

```bash
pnpm db:push
```

This creates:
- `oauth_authorization_code` table
- `oauth_token` table
- `oauth_token_type` enum

### 5. Install Dependencies

The OAuth implementation requires the `jose` library for JWT operations:

```bash
pnpm add jose
```

## Client Integration

### Authorization Code Flow

```typescript
// 1. Redirect user to authorization endpoint
const authUrl = new URL('https://rekisteri.tietokilta.fi/oauth/authorize');
authUrl.searchParams.set('client_id', 'events-platform');
authUrl.searchParams.set('redirect_uri', 'https://events.tietokilta.fi/auth/callback');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('state', generateRandomState()); // CSRF protection
authUrl.searchParams.set('scope', 'openid profile email');

// Redirect user
window.location.href = authUrl.toString();

// 2. Handle callback (on your server)
// User will be redirected back with: ?code=ABC123&state=...

// 3. Exchange code for tokens
const tokenResponse = await fetch('https://rekisteri.tietokilta.fi/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: 'https://events.tietokilta.fi/auth/callback',
    client_id: 'events-platform',
    client_secret: process.env.OAUTH_CLIENT_SECRET,
  }),
});

const tokens = await tokenResponse.json();
// {
//   access_token: "eyJhbG...",
//   token_type: "Bearer",
//   expires_in: 3600,
//   refresh_token: "...",
//   id_token: "eyJhbG..."
// }

// 4. Get user information
const userInfoResponse = await fetch('https://rekisteri.tietokilta.fi/oauth/userinfo', {
  headers: {
    'Authorization': `Bearer ${tokens.access_token}`,
  },
});

const userInfo = await userInfoResponse.json();
// {
//   sub: "user_abc123",
//   email: "user@example.com",
//   name: "John Doe",
//   given_name: "John",
//   family_name: "Doe",
//   is_admin: false,
//   membership_status: "active",
//   membership_type: "Regular Member",
//   membership_expires: "2025-12-31T23:59:59.000Z"
// }
```

### Using Refresh Tokens

```typescript
// Exchange refresh token for new access token
const refreshResponse = await fetch('https://rekisteri.tietokilta.fi/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: storedRefreshToken,
    client_id: 'events-platform',
    client_secret: process.env.OAUTH_CLIENT_SECRET,
  }),
});

const newTokens = await refreshResponse.json();
// {
//   access_token: "eyJhbG...",
//   token_type: "Bearer",
//   expires_in: 3600,
//   id_token: "eyJhbG..."
// }
```

### Client Libraries

Most OAuth libraries work out of the box:

#### Node.js (Oslo)
```typescript
import { OAuth2Client } from 'oslo/oauth2';

const oauth = new OAuth2Client(
  process.env.OAUTH_CLIENT_ID,
  'https://rekisteri.tietokilta.fi/oauth/authorize',
  'https://rekisteri.tietokilta.fi/oauth/token',
  { redirectURI: 'https://events.tietokilta.fi/auth/callback' }
);
```

#### Python (Authlib)
```python
from authlib.integrations.requests_client import OAuth2Session

client = OAuth2Session(
    client_id='events-platform',
    client_secret=os.environ['OAUTH_CLIENT_SECRET'],
    redirect_uri='https://events.tietokilta.fi/auth/callback'
)
```

## Security Considerations

### ✅ Implemented
- **RS256 JWT signing** - Industry standard asymmetric signing
- **Short-lived authorization codes** - 10 minutes
- **Token expiration** - Access tokens expire in 1 hour
- **Refresh token rotation** - Refresh tokens expire in 30 days
- **State parameter** - CSRF protection
- **Exact redirect URI matching** - Prevents authorization code interception
- **Client secret validation** - Confidential clients only
- **Timing-safe comparison** - Prevents timing attacks
- **Audit logging** - All OAuth events logged

### ⚠️ Not Yet Implemented
- **PKCE** - Proof Key for Code Exchange (for public clients)
- **Token revocation endpoint** - `/oauth/revoke`
- **Token introspection** - `/oauth/introspect`
- **Scope enforcement** - Currently all clients get same claims
- **Rate limiting** - OAuth endpoints not rate-limited yet

### Best Practices

1. **Never expose client secrets** - Keep them server-side only
2. **Always validate state parameter** - Prevents CSRF attacks
3. **Store tokens securely** - Use HttpOnly cookies or encrypted storage
4. **Implement token refresh** - Don't let users log out unexpectedly
5. **Verify JWT signatures** - Use the JWKS endpoint
6. **Check token expiration** - Don't trust expired tokens
7. **Log OAuth events** - Monitor for suspicious activity

## Troubleshooting

### "Invalid client_id"
- Check that the client is defined in `OAUTH_CLIENTS` environment variable
- Ensure JSON is valid (use a JSON validator)
- Verify no typos in client ID

### "Invalid redirect_uri"
- Redirect URI must **exactly** match what's in the client configuration
- Check for trailing slashes, http vs https, port numbers
- Verify URL encoding if needed

### "Invalid or expired authorization code"
- Authorization codes expire after 10 minutes
- Codes can only be used once
- Ensure clock synchronization between services

### "Invalid token"
- Check that JWT is being verified with the correct public key
- Verify the token hasn't expired
- Ensure the token is being sent in the `Authorization: Bearer <token>` header

### "OAUTH_PRIVATE_KEY not configured"
- Ensure the private key is set in environment variables
- Check that newlines are properly escaped in the PEM file
- Verify the key format (should include `-----BEGIN PRIVATE KEY-----` header)

## Testing

### Manual Testing

1. **Generate keys**:
```bash
openssl genrsa -out test-private.pem 2048
openssl rsa -in test-private.pem -pubout -out test-public.pem
```

2. **Configure test client**:
```bash
export OAUTH_CLIENTS='[{"id":"test","secret":"test-secret","name":"Test Client","redirectUris":["http://localhost:3000/callback"]}]'
export OAUTH_PRIVATE_KEY="$(cat test-private.pem)"
export OAUTH_PUBLIC_KEY="$(cat test-public.pem)"
```

3. **Test authorization flow**:
```bash
# Visit in browser
http://localhost:5173/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&response_type=code&state=random123

# Exchange code (copy from redirect)
curl -X POST http://localhost:5173/oauth/token \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_CODE_HERE" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "client_id=test" \
  -d "client_secret=test-secret"
```

### Automated Testing

Add to Playwright tests:

```typescript
test('OAuth authorization flow', async ({ page, request }) => {
  // Start authorization
  await page.goto('/oauth/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&response_type=code&state=xyz');

  // Should redirect to sign-in if not logged in
  await expect(page).toHaveURL(/sign-in/);

  // Log in
  await page.fill('input[name="email"]', 'test@example.com');
  await page.click('button[type="submit"]');

  // Enter OTP (in test environment)
  // ...

  // Should redirect back with code
  await page.waitForURL(/callback\?code=/);
  const url = new URL(page.url());
  const code = url.searchParams.get('code');
  expect(code).toBeTruthy();

  // Exchange for token
  const tokenResponse = await request.post('/oauth/token', {
    form: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://localhost:3000/callback',
      client_id: 'test',
      client_secret: 'test-secret',
    },
  });

  expect(tokenResponse.status()).toBe(200);
  const tokens = await tokenResponse.json();
  expect(tokens.access_token).toBeTruthy();
  expect(tokens.refresh_token).toBeTruthy();
});
```

## Monitoring

### Audit Logs

OAuth events are logged to the `audit_log` table:

- `oauth.authorize` - User authorized a client
- `oauth.token_issued` - Tokens issued (authorization code flow)
- `oauth.token_refreshed` - Tokens refreshed
- `oauth.userinfo_accessed` - UserInfo endpoint accessed

Query recent OAuth activity:
```sql
SELECT * FROM audit_log
WHERE action LIKE 'oauth.%'
ORDER BY created_at DESC
LIMIT 100;
```

### Metrics to Track

- Authorization request rate
- Token issuance rate
- Token refresh rate
- Failed authorization attempts
- Invalid client credentials
- Expired authorization codes

## Maintenance

### Key Rotation

To rotate JWT signing keys:

1. Generate new key pair
2. Add new key to JWKS endpoint with new `kid` (key ID)
3. Update `OAUTH_PRIVATE_KEY` to sign with new key
4. Keep old public key in JWKS for 24-48 hours (grace period)
5. Remove old public key from JWKS

### Token Cleanup

OAuth tokens are automatically cleaned up daily at 3 AM via cron job:
- Expired authorization codes (>10 minutes old)
- Expired refresh tokens (>30 days old)

Manual cleanup:
```sql
-- Delete expired authorization codes
DELETE FROM oauth_authorization_code WHERE expires_at < NOW();

-- Delete expired refresh tokens
DELETE FROM oauth_token WHERE expires_at < NOW();
```

## References

- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [JWT RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519)
- [JWKS RFC 7517](https://datatracker.ietf.org/doc/html/rfc7517)

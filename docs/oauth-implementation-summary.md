# OAuth 2.0 / OpenID Connect Implementation Summary

## What Was Implemented

This is a proof-of-concept implementation of a minimal OAuth 2.0 and OpenID Connect provider for rekisteri, allowing other Tietokilta services to use "Sign in with Rekisteri" functionality.

### Key Features

✅ **OAuth 2.0 Authorization Code Flow**
- Standard OAuth 2.0 flow for web applications
- Stateless JWT access tokens (1 hour expiration)
- Refresh tokens for long-lived sessions (30 days)

✅ **OpenID Connect Support**
- ID tokens with user claims
- UserInfo endpoint
- Discovery document (`.well-known/openid-configuration`)
- JWKS endpoint for public key distribution

✅ **Simplified Architecture**
- Environment-based client configuration (Terraform-friendly)
- Auto-approval for trusted clients (no consent screen)
- All clients get same scopes (simplified permissions)

✅ **Security Best Practices**
- RS256 JWT signing with RSA keys
- Authorization code single-use and expiration (10 minutes)
- Token expiration and cleanup
- Audit logging for all OAuth events
- Timing-safe credential validation

## File Structure

### Core OAuth Modules

```
src/lib/server/oauth/
├── config.ts        # Client configuration loader from env vars
├── tokens.ts        # Authorization code and refresh token management
├── jwt.ts           # JWT signing and verification utilities
└── claims.ts        # User claims generation from database
```

### API Endpoints

```
src/routes/
├── oauth/
│   ├── authorize/+server.ts   # Authorization endpoint
│   ├── token/+server.ts        # Token exchange endpoint
│   └── userinfo/+server.ts     # UserInfo endpoint
└── .well-known/
    ├── openid-configuration/+server.ts  # Discovery document
    └── jwks.json/+server.ts             # Public keys
```

### Database Schema

```
src/lib/server/db/schema.ts
- oauth_authorization_code table
- oauth_token table
- oauth_token_type enum
```

### Configuration

```
src/lib/server/env.ts           # Environment variable validation
.env.example                     # Example configuration
docs/oauth-setup.md             # Complete setup guide
```

## Database Changes

### New Tables

#### `oauth_authorization_code`
- `code` (text, primary key) - Authorization code
- `user_id` (text, foreign key) - User who authorized
- `client_id` (text) - Client identifier
- `redirect_uri` (text) - Callback URL
- `expires_at` (timestamp) - Expiration time (10 minutes)
- `created_at` (timestamp) - Creation time

#### `oauth_token`
- `token` (text, primary key) - Refresh token
- `type` (enum: access|refresh) - Token type
- `user_id` (text, foreign key) - Token owner
- `client_id` (text) - Client identifier
- `expires_at` (timestamp) - Expiration time
- `created_at` (timestamp) - Creation time

## Environment Variables

### Required (Only if Using OAuth)

```bash
# RSA key pair for JWT signing
OAUTH_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
OAUTH_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# OAuth clients (JSON array)
OAUTH_CLIENTS='[{"id":"client-id","secret":"secret","name":"Client Name","redirectUris":["https://..."]}]'
```

## Dependencies

### To Install

```bash
pnpm add jose
```

The `jose` library is required for JWT operations (signing, verification, key import/export).

**Note**: Installation requires Node.js 24.5.0+ (as specified in package.json engines).

## Next Steps to Make it Production-Ready

### 1. Install Dependencies
```bash
pnpm add jose
```

### 2. Generate RSA Keys
```bash
openssl genrsa -out oauth-private-key.pem 2048
openssl rsa -in oauth-private-key.pem -pubout -out oauth-public-key.pem
```

### 3. Configure Environment
Add to `.env`:
```bash
OAUTH_PRIVATE_KEY="$(cat oauth-private-key.pem)"
OAUTH_PUBLIC_KEY="$(cat oauth-public-key.pem)"
OAUTH_CLIENTS='[...]'  # See docs/oauth-setup.md
```

### 4. Push Database Schema
```bash
pnpm db:push
```

### 5. Test the Flow
Follow the testing guide in `docs/oauth-setup.md`

## What's NOT Implemented Yet

The following features were intentionally excluded from this proof of concept but can be added later:

### ❌ PKCE (Proof Key for Code Exchange)
- Required for public clients (mobile apps, SPAs)
- Not needed for server-side confidential clients
- **Effort**: ~4-8 hours

### ❌ Token Revocation Endpoint
- Allows clients to revoke refresh tokens
- **Endpoint**: `POST /oauth/revoke`
- **Effort**: ~2-4 hours

### ❌ Consent Screen
- Currently auto-approves all requests (trusted clients)
- Could add optional consent for untrusted clients
- **Effort**: ~8-12 hours

### ❌ Scope Enforcement
- All clients currently get same claims
- Could implement granular permissions
- **Effort**: ~6-10 hours

### ❌ Client Management UI
- Clients configured via environment variables only
- Could add admin UI for managing clients
- **Effort**: ~12-16 hours

### ❌ Rate Limiting
- OAuth endpoints not rate-limited yet
- Should add to prevent abuse
- **Effort**: ~4-6 hours

### ❌ Dynamic Client Registration
- Self-service client registration
- Not needed for internal services
- **Effort**: ~16-24 hours

## Testing Recommendations

### Unit Tests
- Token generation/validation
- JWT signing/verification
- Client configuration loading
- User claims generation

### Integration Tests
- Full authorization code flow
- Token exchange
- Refresh token flow
- UserInfo endpoint with various tokens
- Error cases (invalid credentials, expired codes, etc.)

### End-to-End Tests
- Complete OAuth flow with real client
- Sign-in flow integration
- Token refresh workflow

### Security Tests
- Timing attack resistance
- Token expiration enforcement
- Client credential validation
- Redirect URI validation

## Estimated Effort

**Implementation Time**: ~60 hours (1.5 weeks)

Breakdown:
- Database schema: 4 hours ✅
- Config loader: 2 hours ✅
- JWT utilities: 4 hours ✅
- Authorize endpoint: 6 hours ✅
- Token endpoint: 8 hours ✅
- UserInfo endpoint: 3 hours ✅
- Discovery endpoints: 2 hours ✅
- Environment validation: 2 hours ✅
- Audit logging: 3 hours ✅
- Documentation: 4 hours ✅
- **Testing**: 12 hours ⏳ (not yet done)
- **First integration**: 8 hours ⏳ (not yet done)

## Integration Example

See `docs/oauth-setup.md` for complete integration guide.

Quick example for a client service:

```typescript
// 1. Redirect to authorize
window.location.href = 'https://rekisteri.tietokilta.fi/oauth/authorize?' +
  'client_id=events-platform&' +
  'redirect_uri=https://events.tietokilta.fi/callback&' +
  'response_type=code&' +
  'state=random123';

// 2. Exchange code for tokens (server-side)
const tokens = await fetch('https://rekisteri.tietokilta.fi/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: 'https://events.tietokilta.fi/callback',
    client_id: 'events-platform',
    client_secret: process.env.OAUTH_CLIENT_SECRET,
  }),
}).then(r => r.json());

// 3. Get user info
const user = await fetch('https://rekisteri.tietokilta.fi/oauth/userinfo', {
  headers: { Authorization: `Bearer ${tokens.access_token}` },
}).then(r => r.json());
```

## Questions?

See `docs/oauth-setup.md` for:
- Complete setup instructions
- Terraform examples
- Client integration guides
- Troubleshooting tips
- Security best practices

---

**Status**: ✅ Proof of Concept Complete
**Production Ready**: ⚠️ Requires testing and first integration
**Estimated Time to Production**: 2-3 days

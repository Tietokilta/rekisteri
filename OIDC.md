# Integrating with Rekisteri OIDC

Rekisteri provides OpenID Connect (OIDC Core 1.0 / OAuth 2.0) authentication for client applications using the authorization code flow with PKCE. Claims are available both in the signed `id_token` and from the UserInfo endpoint.

The issuer is the site origin, e.g. `https://rekisteri.tietokilta.fi`, so most client libraries only need the issuer URL and use discovery for the rest.

---

## 1. Endpoints

| Endpoint          | Method | Path                                | Description                                 |
| :---------------- | :----- | :---------------------------------- | :------------------------------------------ |
| **Discovery**     | `GET`  | `/.well-known/openid-configuration` | OpenID configuration document               |
| **JWKS**          | `GET`  | `/oidc/jwks`                        | Public RSA keys for JWT verification        |
| **Authorization** | `GET`  | `/oidc/authorize`                   | Login & consent flow                        |
| **Token**         | `POST` | `/oidc/token`                       | Authorization code & refresh token exchange |
| **UserInfo**      | `GET`  | `/oidc/userinfo`                    | Claims for the access token's scopes        |
| **Logout**        | `GET`  | `/oidc/logout`                      | RP-Initiated logout                         |

---

## 2. Authentication Flow

### Step 1: Authorization Request (`GET /oidc/authorize`)

Redirect the user to the authorization endpoint:

```
GET /oidc/authorize?
  client_id=YOUR_CLIENT_ID
  &redirect_uri=https%3A%2F%2Fmyapp.org%2Fcallback
  &response_type=code
  &state=RANDOM_STATE_STRING
  &code_challenge=PKCE_CODE_CHALLENGE
  &code_challenge_method=S256
```

- `scope`: Always include `openid`. Add `profile`, `email`, `membership`, or `offline_access` (for refresh tokens) as permitted for your client. `offline_access` also requires `prompt=consent` (OIDC Core §11), so the user is asked for consent on each such request; without it no refresh token is issued.
- `code_challenge`: Base64URL-encoded SHA-256 hash of your PKCE `code_verifier`. PKCE (`S256`) is required for every client. In Discourse, enable the `openid connect use pkce` setting.

### Step 2: Callback with Code

Upon user authentication and consent, Rekisteri redirects to your `redirect_uri`:

```
GET https://myapp.org/callback?code=AUTHORIZATION_CODE&state=RANDOM_STATE_STRING
```

### Step 3: Token Exchange (`POST /oidc/token`)

Exchange the authorization code for tokens via backend POST (`application/x-www-form-urlencoded` or Basic Auth):

```http
POST /oidc/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&code=AUTHORIZATION_CODE
&redirect_uri=https%3A%2F%2Fmyapp.org%2Fcallback
&code_verifier=PKCE_CODE_VERIFIER
```

**Response:**

```json
{
  "access_token": "Gc0XfR2...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "5lYu78qYmY7a4D6...",
  "scope": "openid profile email offline_access"
}
```

The `id_token` already contains the claims for the granted scopes. The `access_token` can be used to fetch the same claims from `GET /oidc/userinfo` (`Authorization: Bearer ...`). It's only valid for UserInfo.

### Step 4: Refresh Token Exchange (`POST /oidc/token`)

If `offline_access` was requested and granted:

```http
POST /oidc/token HTTP/1.1
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&refresh_token=YOUR_REFRESH_TOKEN
```

---

## 3. Scopes & Claims Reference

Claims are returned in the `id_token` (RS256) and from UserInfo, based on the scopes granted to the client. Standard OIDC claim names are used where one exists.

| Scope            | Claims                                                                                                                        | Description                                                                                                    |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| `openid`         | `sub`, `iss`, `aud`, `iat`, `exp`                                                                                             | Subject identifier and protocol timestamps                                                                     |
| `profile`        | `given_name` (`string`)<br>`family_name` (`string`)<br>`locale` (`"fi"` \| `"en"`)<br>`aalto_email_verified` (`boolean`)      | Name, language, and whether the user has a verified aalto.fi address (not student status: staff have them too) |
| `email`          | `email` (`string`)<br>`email_verified` (`boolean`)<br>`verified_emails` (`string[]`)<br>`optional_emails_allowed` (`boolean`) | Primary email, all currently verified emails, and permission for optional emails                               |
| `membership`     | `active_memberships` (`string[]`)                                                                                             | Identifiers of the user's active membership types                                                              |
| `offline_access` | _(issues `refresh_token`)_                                                                                                    | Enables refresh token generation                                                                               |

---

## 4. Integration Example (NextAuth.js / Auth.js)

```javascript
import OIDCProvider from "next-auth/providers/oidc";

export const authOptions = {
  providers: [
    OIDCProvider({
      id: "rekisteri",
      name: "Rekisteri",
      issuer: "https://rekisteri.tietokilta.fi",
      clientId: REKISTERI_CLIENT_ID,
      clientSecret: REKISTERI_CLIENT_SECRET,
      authorization: { params: { scope: "openid profile email" } },
      checks: ["pkce", "state"],
      profile(profile) {
        return {
          id: profile.sub,
          name: `${profile.given_name} ${profile.family_name}`,
          email: profile.email,
        };
      },
    }),
  ],
};
```

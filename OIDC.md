# Integrating with Rekisteri OIDC

Rekisteri provides OpenID Connect (OIDC Core 1.0 / OAuth 2.0) authentication for client applications using a **pure claims `id_token` model** with PKCE authorization code flow.

---

## 1. Endpoints

| Endpoint          | Method | Path                                     | Description                                 |
| :---------------- | :----- | :--------------------------------------- | :------------------------------------------ |
| **Discovery**     | `GET`  | `/oidc/.well-known/openid-configuration` | OpenID configuration document               |
| **JWKS**          | `GET`  | `/oidc/jwks`                             | Public RSA keys for JWT verification        |
| **Authorization** | `GET`  | `/oidc/auth`                             | Login & consent flow                        |
| **Token**         | `POST` | `/oidc/token`                            | Authorization code & refresh token exchange |
| **Logout**        | `GET`  | `/oidc/logout`                           | RP-Initiated logout                         |

---

## 2. Authentication Flow

### Step 1: Authorization Request (`GET /oidc/auth`)

Redirect the user to the authorization endpoint:

```
GET /oidc/auth?
  client_id=YOUR_CLIENT_ID
  &redirect_uri=https%3A%2F%2Fmyapp.org%2Fcallback
  &response_type=code
  &state=RANDOM_STATE_STRING
  &code_challenge=PKCE_CODE_CHALLENGE
  &code_challenge_method=S256
```

- `scope`: Always include `openid`. Add `profile`, `email`, `membership`, or `offline_access` (for refresh tokens) as permitted for your client.
- `code_challenge`: Base64URL-encoded SHA-256 hash of your PKCE `code_verifier`.

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
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "5lYu78qYmY7a4D6..."
}
```

> [!NOTE]
> Rekisteri delivers user identity attributes directly inside the signed `id_token`. No `access_token` or separate UserInfo query is needed.

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

Identity claims are signed in the `id_token` (RS256) based on the client's authorized scopes:

| Scope            | Claims                                                                                                               | Description                                                               |
| :--------------- | :------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| `openid`         | `sub`, `iss`, `aud`, `iat`, `exp`                                                                                    | Subject identifier and protocol timestamps                                |
| `profile`        | `given_name` (`string`)<br>`family_name` (`string`)<br>`locale` (`"fi"` \| `"en"`)<br>`verified_student` (`boolean`) | User's name, language preference, and `@aalto.fi` verified student status |
| `email`          | `primary_email` (`string`)<br>`verified_emails` (`string[]`)<br>`optional_emails_allowed` (`boolean`)                | Primary email, all verified emails, and marketing email preference        |
| `membership`     | `active_memberships` (`string[]`)                                                                                    | Identifiers of user's active membership types                             |
| `offline_access` | _(issues `refresh_token`)_                                                                                           | Enables refresh token generation                                          |

---

## 4. Integration Example (NextAuth.js / Auth.js)

```javascript
import OIDCProvider from "next-auth/providers/oidc";

export const authOptions = {
  providers: [
    OIDCProvider({
      id: "rekisteri",
      name: "Rekisteri",
      issuer: "https://rekisteri.tietokilta.fi/oidc",
      clientId: REKISTERI_CLIENT_ID,
      clientSecret: REKISTERI_CLIENT_SECRET,
      authorization: { params: { scope: "openid profile email offline_access" } },
      checks: ["pkce", "state"],
      profile(profile) {
        return {
          id: profile.sub,
          name: `${profile.given_name} ${profile.family_name}`,
          email: profile.primary_email,
        };
      },
    }),
  ],
};
```

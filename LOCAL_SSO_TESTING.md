# Local SSO Testing Guide

This guide explains how to test the shared cookie SSO locally when running multiple services on localhost.

## The Problem

Cookies can't be shared between different ports on localhost:
- `localhost:5173` (rekisteri)
- `localhost:3000` (ilmo)
- `localhost:4000` (tietokilta.fi)

These are considered different origins, so cookies won't be shared even if you set `COOKIE_DOMAIN=".localhost"` (which doesn't work anyway).

## Solution 1: Using /etc/hosts (Recommended)

Simulate subdomains locally by mapping custom domains to 127.0.0.1.

### Step 1: Edit /etc/hosts

```bash
sudo nano /etc/hosts
```

Add these lines:

```
127.0.0.1 rekisteri.local.tietokilta.fi
127.0.0.1 ilmo.local.tietokilta.fi
127.0.0.1 local.tietokilta.fi
```

Save and exit.

### Step 2: Configure rekisteri

In `.env`:

```bash
# Use local domain
PUBLIC_URL="http://rekisteri.local.tietokilta.fi:5173"

# Set cookie domain to share across local subdomains
COOKIE_DOMAIN=".local.tietokilta.fi"

# Other config...
DATABASE_URL="postgres://root:mysecretpassword@localhost:5432/local"
STRIPE_API_KEY="sk_test_..."
# ... etc
```

### Step 3: Run rekisteri

```bash
pnpm dev --host rekisteri.local.tietokilta.fi --port 5173
```

Visit: http://rekisteri.local.tietokilta.fi:5173

### Step 4: Test Other Services

For **ilmo.local.tietokilta.fi**:

```bash
# In ilmo project directory
# Run on port 3000
npm run dev -- --host ilmo.local.tietokilta.fi --port 3000
```

For **local.tietokilta.fi**:

```bash
# In tietokilta.fi project directory
# Run on port 4000
npm run dev -- --host local.tietokilta.fi --port 4000
```

### Step 5: Test SSO Flow

1. Visit http://rekisteri.local.tietokilta.fi:5173
2. Login with `root@tietokilta.fi`
3. Open browser DevTools → Application → Cookies
4. Verify cookie domain is `.local.tietokilta.fi`
5. Visit http://ilmo.local.tietokilta.fi:3000
6. Cookie should be present and session valid!

### Integration Code for Other Services

In your other service, update the rekisteri URL:

```typescript
// For local development
const REKISTERI_URL = "http://rekisteri.local.tietokilta.fi:5173";

// Or use environment variable
const REKISTERI_URL = process.env.REKISTERI_URL || "https://rekisteri.tietokilta.fi";
```

---

## Solution 2: Using Reverse Proxy

Use a reverse proxy to route all services through one port.

### Step 1: Install Caddy (or nginx)

```bash
# macOS
brew install caddy

# Linux
sudo apt install caddy

# Or use npm package
npm install -g local-ssl-proxy
```

### Step 2: Create Caddyfile

Create `Caddyfile` in your project root:

```
# Rekisteri
rekisteri.local.test {
    reverse_proxy localhost:5173
}

# Ilmo
ilmo.local.test {
    reverse_proxy localhost:3000
}

# Main site
local.test {
    reverse_proxy localhost:4000
}
```

### Step 3: Edit /etc/hosts

```bash
sudo nano /etc/hosts
```

Add:

```
127.0.0.1 rekisteri.local.test
127.0.0.1 ilmo.local.test
127.0.0.1 local.test
```

### Step 4: Run Caddy

```bash
caddy run
```

### Step 5: Configure rekisteri

In `.env`:

```bash
PUBLIC_URL="http://rekisteri.local.test"
COOKIE_DOMAIN=".local.test"
```

### Step 6: Start Services

```bash
# Terminal 1 - Rekisteri
cd rekisteri
pnpm dev --port 5173

# Terminal 2 - Ilmo
cd ilmo
npm run dev --port 3000

# Terminal 3 - Main site
cd tietokilta.fi
npm run dev --port 4000

# Terminal 4 - Caddy
caddy run
```

### Step 7: Access Services

- Rekisteri: http://rekisteri.local.test
- Ilmo: http://ilmo.local.test
- Main site: http://local.test

Cookies will be shared across `*.local.test`!

---

## Solution 3: Simple API Testing (No Cookie Sharing)

If you just want to test the API endpoints without full SSO flow:

### Step 1: Run rekisteri normally

```bash
# No COOKIE_DOMAIN needed
pnpm dev
```

### Step 2: Login and get session token

1. Visit http://localhost:5173
2. Login with any email
3. Open DevTools → Application → Cookies
4. Copy the `auth-session` cookie value

### Step 3: Test APIs with curl

```bash
# Test session validation
curl -v -b "auth-session=YOUR_TOKEN_HERE" \
  http://localhost:5173/api/auth/session

# Test userinfo
curl -b "auth-session=YOUR_TOKEN_HERE" \
  http://localhost:5173/api/auth/userinfo | jq

# Test logout
curl -X POST -b "auth-session=YOUR_TOKEN_HERE" \
  http://localhost:5173/api/auth/logout
```

### Step 4: Test from other service code

In your other service (running on different port), manually pass the token:

```typescript
// For testing only - manually provide token
const sessionToken = "paste-token-here";

const response = await fetch("http://localhost:5173/api/auth/userinfo", {
  headers: {
    Cookie: `auth-session=${sessionToken}`,
  },
});

const userInfo = await response.json();
console.log("User info:", userInfo);
```

This lets you test the API responses without cookie sharing.

---

## Recommended Workflow

**For quick API testing:**
- Use Solution 3 (curl + manual tokens)
- Fast, no configuration needed
- Good for testing API response formats

**For full SSO testing:**
- Use Solution 1 (/etc/hosts)
- Most similar to production
- Easy to set up and maintain

**For production-like setup:**
- Use Solution 2 (reverse proxy)
- Clean URLs without ports
- More complex but most realistic

---

## Troubleshooting

### Cookie not appearing in other service

1. **Check cookie domain:**
   ```javascript
   // In browser console on rekisteri
   document.cookie
   // Should see: auth-session=...; domain=.local.tietokilta.fi
   ```

2. **Verify COOKIE_DOMAIN is set:**
   ```bash
   # In rekisteri
   echo $COOKIE_DOMAIN
   # Should output: .local.tietokilta.fi
   ```

3. **Check /etc/hosts:**
   ```bash
   cat /etc/hosts | grep local.tietokilta.fi
   # Should show all your mappings
   ```

4. **Test DNS resolution:**
   ```bash
   ping rekisteri.local.tietokilta.fi
   # Should resolve to 127.0.0.1
   ```

### Cookie exists but not being sent

1. **SameSite attribute:** Cookies with `SameSite=Lax` are sent on top-level navigation but not on cross-origin requests. This is expected and correct.

2. **Check browser DevTools:**
   - Open Network tab
   - Look at request to ilmo
   - Check "Request Headers"
   - Cookie should be in "Cookie" header

3. **Try in incognito mode:** Sometimes browser extensions interfere with cookies.

### Services can't access custom domains

1. **Flush DNS cache:**
   ```bash
   # macOS
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

   # Linux
   sudo systemd-resolve --flush-caches

   # Windows
   ipconfig /flushdns
   ```

2. **Restart browser:** Changes to /etc/hosts may require browser restart.

3. **Check port conflicts:** Make sure no other process is using your ports:
   ```bash
   lsof -i :5173
   lsof -i :3000
   ```

### API returns 401 Unauthorized

1. **Cookie not being sent:** Check Network tab in DevTools
2. **Session expired:** Login again in rekisteri
3. **Wrong domain:** Cookie domain doesn't match requesting domain
4. **CORS issues:** If testing cross-origin, might need CORS headers

---

## Testing Checklist

- [ ] Can login at rekisteri.local.tietokilta.fi
- [ ] Cookie domain is `.local.tietokilta.fi`
- [ ] Cookie appears in ilmo.local.tietokilta.fi
- [ ] `/api/auth/session` returns user data
- [ ] `/api/auth/userinfo` returns membership status
- [ ] Form auto-fills with user data
- [ ] Membership status shows correctly
- [ ] Logout works across all services
- [ ] Return URL redirect works after login

---

## Production vs Local Differences

| Feature | Local | Production |
|---------|-------|------------|
| Domain | `.local.tietokilta.fi` | `.tietokilta.fi` |
| Protocol | `http://` | `https://` |
| Ports | `:5173`, `:3000`, etc. | `:443` (standard) |
| COOKIE_DOMAIN | `.local.tietokilta.fi` | `.tietokilta.fi` |
| Secure flag | `false` | `true` |

The code is the same, only environment variables change!

---

## Quick Start Commands

```bash
# 1. Edit /etc/hosts
sudo nano /etc/hosts
# Add: 127.0.0.1 rekisteri.local.tietokilta.fi ilmo.local.tietokilta.fi

# 2. Configure rekisteri .env
echo 'COOKIE_DOMAIN=".local.tietokilta.fi"' >> .env

# 3. Start rekisteri
pnpm dev --host rekisteri.local.tietokilta.fi

# 4. Test in browser
open http://rekisteri.local.tietokilta.fi:5173

# 5. Check cookie
# DevTools → Application → Cookies → .local.tietokilta.fi
```

That's it! Now you can test SSO locally. 🎉

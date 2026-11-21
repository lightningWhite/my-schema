# Sign-in helper

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that
finishes "Sign in with GitHub" for the app. It swaps GitHub's one-time code
for a token, which needs the OAuth App's client secret and can't be done from
a browser. It stores nothing, logs nothing, and never sees anyone's tidbits.
The free plan is far more than enough.

## One-time setup (about 15 minutes)

You need a GitHub account (you have one) and a free Cloudflare account.

### 1. Register the GitHub OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (https://github.com/settings/applications/new).
2. Fill in:
   - **Application name:** `Schema`
   - **Homepage URL:** `https://lightningwhite.github.io/my-schema/`
     (the app's address; it follows the repo's name)
   - **Authorization callback URL:** the same address as the homepage.
3. Click **Register application**.
4. Copy the **Client ID**. Then click **Generate a new client secret** and copy
   the secret (GitHub shows it once).

### 2. Deploy the Worker

On a computer with Node.js installed, from this `worker/` folder:

```sh
npx wrangler login                        # opens a browser to sign in to Cloudflare
npx wrangler secret put GITHUB_CLIENT_ID      # paste the Client ID
npx wrangler secret put GITHUB_CLIENT_SECRET  # paste the client secret
npx wrangler deploy
```

`deploy` prints the Worker's address, like
`https://schema-signin.<your-name>.workers.dev`. If the app is served from
somewhere other than `https://lightningwhite.github.io`, change
`ALLOWED_ORIGIN` in `wrangler.toml` first.

### 3. Tell the app about it

In the GitHub repo: **Settings → Secrets and variables → Actions → Variables
→ New repository variable**, add:

- `SIGNIN_CLIENT_ID` = the Client ID
- `SIGNIN_URL` = the Worker's address

(GitHub doesn't allow variable names starting with `GITHUB_`.)

Then re-run the **CI and deploy** workflow (or push anything). The **Sign in
with GitHub** button appears in Settings.

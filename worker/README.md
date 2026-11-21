# Sign-in helper

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that
finishes "Sign in with GitHub" for the app. It swaps GitHub's one-time code
for a token, which needs the GitHub App's client secret and can't be done from
a browser. It stores nothing, logs nothing, and never sees anyone's tidbits.
The free plan is far more than enough.

## One-time setup (about 15 minutes)

You need a GitHub account (you have one) and a free Cloudflare account.

### 1. Register the GitHub App

A GitHub App (not an "OAuth App") lets each person share **only their backup
repository** with Schema, instead of their whole GitHub account.

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
   (https://github.com/settings/apps/new).
2. Fill in:
   - **GitHub App name:** something unique on GitHub, like `Schema Tidbits`.
     The name becomes the app's address, e.g. `github.com/apps/schema-tidbits`;
     that last part is the **slug** you'll need in step 3.
   - **Description:** what people see when they install it, e.g. *Backs up your
     Schema tidbits to a private repository in your own GitHub account. Only you
     can see it.*
   - **Homepage URL:** `https://lightningwhite.github.io/my-schema/`
   - **Callback URL:** the same address.
   - **Expire user authorization tokens:** unchecked (otherwise people are signed
     out every 8 hours).
   - **Request user authorization (OAuth) during installation:** **checked**
     (installing then signs the person in and sends them back to the app).
   - **Enable Device Flow:** unchecked.
   - **Setup URL** and **Redirect on update:** leave empty / unchecked.
   - **Webhook → Active:** **unchecked**. Schema doesn't use webhooks.
   - **Permissions → Repository permissions → Contents:** **Read and write**.
     (Metadata: read-only is added automatically.) Nothing else.
   - **Where can this GitHub App be installed?** **Any account**.
3. Click **Create GitHub App**.
4. On the app's page, copy the **Client ID** (not the App ID). Click **Generate a
   new client secret** and copy it (GitHub shows it once). You don't need a
   private key.

If you registered an OAuth App earlier, you can delete it once this works.

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

- `SIGNIN_CLIENT_ID` = the GitHub App's Client ID
- `SIGNIN_APP_SLUG` = the app's slug (from `github.com/apps/<slug>`)
- `SIGNIN_URL` = the Worker's address

(GitHub doesn't allow variable names starting with `GITHUB_`.)

Then re-run the **CI and deploy** workflow (or push anything). Settings →
**Back up & sync** then shows the two setup steps.

### Switching from an OAuth App

If the Worker is already deployed with an OAuth App's credentials, put the
GitHub App's in their place (`npx wrangler secret put GITHUB_CLIENT_ID`, then
`... GITHUB_CLIENT_SECRET`; no redeploy needed), update `SIGNIN_CLIENT_ID`, add
`SIGNIN_APP_SLUG`, and re-run the workflow. Anyone already signed in with the
OAuth App keeps syncing until they sign out.

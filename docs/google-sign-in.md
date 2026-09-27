# Setting up Google sign-in

Google sign-in is optional. Password sign-in works without it. It is **invite-only**: a Google account can sign in only if its email is on the **People** page with **Google** ticked.

You need a free Google Cloud "OAuth client". This takes about 10 minutes.

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com/> and sign in.
2. Use the project picker at the top to create a new project, e.g. **Hallinta**.

## 2. Configure the consent screen

1. Go to **APIs & Services → OAuth consent screen** (in newer consoles: **Google Auth Platform → Branding / Audience**).
2. Choose **External** (so collaborators with any Google account can sign in), unless everyone is in your own Google Workspace organization, in which case **Internal** is simpler.
3. Fill in the app name (e.g. "Hallinta – Your Lab"), a support email, and a developer contact email.
4. Scopes: Hallinta only needs `openid`, `email`, and `profile`, which are the defaults.
5. While the app is in **Testing**, only the accounts you list under **Test users** can sign in. Add yourself and your students there, or publish the app when you're ready. Because Hallinta only asks for basic profile information, publishing normally doesn't require a review by Google.

## 3. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID** (or **Google Auth Platform → Clients → Create client**).
2. Application type: **Web application**.
3. Under **Authorized redirect URIs**, add the address of Hallinta's callback, exactly:
   - on your own computer: `http://localhost:3000/api/auth/google/callback`
   - on a server: `https://hallinta.your-lab.example/api/auth/google/callback`

   Google only allows `http://` for `localhost`; a server needs HTTPS.
4. Click **Create** and copy the **Client ID** and **Client secret**.

## 4. Tell Hallinta

Add to `.env.local` (never commit this file):

```bash
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Only if Hallinta is behind a reverse proxy or the address people use differs
# from what the server sees:
# HALLINTA_PUBLIC_URL=https://hallinta.your-lab.example
```

Restart Hallinta. The sign-in page now shows **Continue with Google**.

## 5. Invite people

On the **People** page, add the person with the email of their Google account and tick **Google account with this email** (a password is optional). For existing people, tick **Google** in their row.

## Troubleshooting

- **`redirect_uri_mismatch` from Google**: the callback address in step 3 must match exactly, including `http`/`https`, the port, and no trailing slash. Behind a proxy, set `HALLINTA_PUBLIC_URL`.
- **"… hasn't been invited to use Google sign-in here"**: the email isn't on the People page, **Google** isn't ticked for them, or the account is disabled.
- **"Access blocked: app has not completed verification"** or a Google error about test users: while the consent screen is in Testing, add the person as a test user, or publish the app.

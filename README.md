# 🎄 Family Secret Santa

A small Secret Santa web app for a family of ~6 people.

- **No passwords, no email.** Each person gets a private link (`https://…/#t=<token>`), usually sent over WhatsApp.
- Everyone edits their own **wishlist** and can read everyone else's.
- After the **draw**, each person sees only "Quest'anno fai il regalo a …", with that person's list highlighted.
- The admin (you) manages people, couples and the yearly draw, but **can never see the pairings**.
- The app is in Italian; all text lives in [`src/strings.it.ts`](src/strings.it.ts).

## How it works

| Part | Where | What |
|---|---|---|
| Frontend | `src/` | Vite + vanilla TypeScript static site, hosted on GitHub Pages |
| API | `supabase/functions/api/` | One Supabase Edge Function (Deno) that handles every action |
| Draw algorithm | `supabase/functions/_shared/draw.ts` | Randomized backtracking, unit-tested in `tests/` |
| Database | `supabase/migrations/` | Postgres tables, with RLS on and **no policies** |
| Bootstrap | `scripts/bootstrap-admin.mjs` | Creates the first admin and prints their link |
| Deploy | `.github/workflows/deploy.yml` | Tests, builds and publishes to GitHub Pages on every push to `main` |

**Security model, briefly**

- A personal token is 32 random bytes (base64url). It lives in the URL *fragment* (`#t=…`), which browsers never send to servers or in `Referer` headers.
- The database stores only the token's SHA-256 hash. That's why a link can be shown **only once**, right after it is created. If someone loses theirs, you make a new one, and the old one stops working.
- The browser sends the token in an `x-santa-token` header. The Edge Function hashes it, finds the participant, and only then reads or writes data using the service role key.
- Every table has Row Level Security enabled with no policies, and table privileges are revoked from the `anon` and `authenticated` roles, so the public Supabase keys can't read anything directly.
- The draw runs on the server with crypto-secure randomness and is saved in a single transaction. No API response ever contains pairings, except each person's own receiver.

> **Honest note:** whoever owns the Supabase project (that's you) *can* still see the
> assignments by opening the `assignments` table in the Supabase dashboard. The app's UI and API
> never reveal them, but the raw database does. If you want to stay surprised too, just don't open
> that table. 🙈

---

## Setup, step by step

Plan on about 30–45 minutes. You only do this once.

### 0. What you need

- A **GitHub** account.
- A **Supabase** account (free plan is plenty): <https://supabase.com>.
- **Node.js 22 or newer** on your computer: <https://nodejs.org> (choose the "LTS" installer). Check it with `node -v` in a terminal.
- **git**: on a Mac it's already there. Try `git --version`.

All commands below are typed in a terminal, inside this project folder.

### 1. Put the code on GitHub

1. On GitHub, create a new **empty** repository, e.g. `secret-santa`. It can be public or private (Pages on a private repo needs a paid plan).
2. In this folder:

   ```sh
   git add -A
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR-USER/secret-santa.git
   git push -u origin main
   ```

Your site address will be **`https://YOUR-USER.github.io/secret-santa/`**. We'll call this the **site URL**.

### 2. Create the Supabase project

1. In the Supabase dashboard, click **New project**. Pick a name, a strong database password (save it in your password manager), and a region close to you (e.g. Frankfurt).
2. Wait until the project is ready, then open **Project Settings**:
   - **General** → copy the **Project ID** (a short code like `abcdefghijklmnop`). This is your *project ref*.
   - **API** / **Data API** → copy the **Project URL** (`https://<project-ref>.supabase.co`).
   - **API Keys** → copy the **`service_role`** secret key. ⚠️ This key can do anything to your database: never put it in the frontend, in git, or in chat.

### 3. Install dependencies and configure `.env`

```sh
npm install
cp .env.example .env
```

Open `.env` in a text editor and fill in:

```sh
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<the service_role key>
SITE_URL=https://YOUR-USER.github.io/secret-santa/
```

`.env` is in `.gitignore`, so it is never committed.

Commit the generated `package-lock.json` so builds are reproducible:

```sh
git add package-lock.json && git commit -m "Add lockfile" && git push
```

### 4. Create the database tables (run the migrations)

We use the Supabase CLI through `npx` (nothing extra to install):

```sh
npx supabase login                               # opens the browser to log in
npx supabase link --project-ref <project-ref>    # asks for the database password from step 2
npx supabase db push                             # creates the tables
```

In the dashboard, **Table Editor** should now show `participants`, `exclusions`, `wishlist_items`, `events` and `assignments`, each marked as RLS enabled.

### 5. Deploy the Edge Function

```sh
npx supabase functions deploy api --no-verify-jwt
```

`--no-verify-jwt` is intentional: the function checks each person's own secret token instead of a Supabase login. (`supabase/config.toml` sets the same thing.)

### 6. Set the function's secret (allowed site)

The function only needs one setting of yours: which website is allowed to call it. Use your site's **origin**, meaning the site URL *without* the `/secret-santa/` path:

```sh
npx supabase secrets set ALLOWED_ORIGIN=https://YOUR-USER.github.io
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function automatically. You don't need to set them.

(If you skip this step, any website is allowed to call the API. That's still safe, because every call needs a valid personal token, but setting it is tidier.)

### 7. Turn on GitHub Pages and tell the build where Supabase is

In your GitHub repository:

1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables tab → New repository variable:**
   - Name: `SUPABASE_URL`
   - Value: `https://<project-ref>.supabase.co`

   (A *variable*, not a secret: this URL is public anyway.)
3. Go to the **Actions** tab, open **Test and deploy to GitHub Pages**, and click **Run workflow** (or just push any commit).

After a minute or two the workflow turns green and your site is live at the site URL. Open it: without a personal link it should say *"Ciao! 🎄 Per entrare ti serve il tuo link personale…"*.

### 8. Create yourself as admin

```sh
npm run bootstrap-admin -- --name "Your Name" --phone "+39 333 1234567"
```

(`--phone` is optional.) The script prints your personal admin link **once**. Open it on your phone and **bookmark it** (or add it to your home screen).

Lost it? Run `npm run bootstrap-admin -- --regenerate` for a new one. The old one stops working.

### 9. Add the family

Open your admin link. At the bottom there's the **Organizzazione** section (only you see it):

1. **Partecipanti → Aggiungi una persona:** type a name and, optionally, a WhatsApp number in international format (`+39 …`).
2. Right after adding someone, a green box shows their **personal link**. ⚠️ It is shown **only now**, because the database stores only a hash of it.
3. Tap **Invia su WhatsApp**. WhatsApp opens with a ready-made message and the link:
   - with a phone number, it goes straight to that person's chat;
   - without one, WhatsApp asks you which contact to send it to.
4. If you closed the box before sending, or someone lost their link, tap **Invia su WhatsApp** or **Nuovo link** on their row. A new link is created and the old one stops working.
5. **Coppie:** add couples (pairs who must never draw each other).

### 10. Run the draw

1. In **Sorteggio**, tap **Crea il Natale 2026** (once per year).
2. When everyone is in, tap **Fai il sorteggio 🎲** and confirm.
3. Everyone now sees *"Quest'anno fai il regalo a …"* on their page. You'll see only *"Sorteggio fatto il …"*.

Rules the draw follows:

- nobody draws themselves;
- nobody draws their partner (couples, both directions);
- if possible, nobody gets the same person as **last year**. If that's impossible, the draw still happens and the app tells you the "no repeat" rule had to be relaxed;
- if even the basic rules can't be satisfied (e.g. only two people who are a couple), nothing is saved and you get a clear error.

**Someone joins late?** Add them, then **Annulla il sorteggio** (you'll have to type `ANNULLA` to confirm) and draw again. Tell everyone to check again, since their receiver may change.

### 11. Next year

Everything stays: people, couples and wishlists. From January onward the admin section offers **Crea il Natale <year>**. Create it, draw again, and the app avoids repeating last year's pairs. Old assignments are kept in the database for exactly that reason.

---

## Local development

```sh
npm run dev      # http://localhost:5173/#t=<your token>
npm test         # unit tests for the draw algorithm
npm run build    # type-check + production build into dist/
```

`npm run dev` talks to your real Supabase project (whatever `VITE_SUPABASE_URL` in `.env` points to). If you set `ALLOWED_ORIGIN`, the function will reject `localhost`. Temporarily run `npx supabase secrets set ALLOWED_ORIGIN='*'` while developing, and set it back afterwards.

After changing anything in `supabase/functions/`, redeploy with:

```sh
npx supabase functions deploy api --no-verify-jwt
```

Frontend changes deploy automatically when you push to `main`.

## Changing the wording

All Italian text (buttons, messages, errors, the WhatsApp greeting) is in [`src/strings.it.ts`](src/strings.it.ts). Edit, commit, push. Done.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "L'app non è ancora configurata" | The `SUPABASE_URL` repository variable (step 7) is missing; re-run the workflow after adding it. |
| "Non riesco a collegarmi" | The function isn't deployed (step 5), or `ALLOWED_ORIGIN` doesn't exactly match your site origin (no trailing slash, no path). |
| "Questo link non funziona più" | That link was regenerated or the person was deactivated. Send a new link. |
| Workflow fails at "Build" | Same as the first row: set the `SUPABASE_URL` variable. |
| Bootstrap says "An admin already exists" | Use `--regenerate` to get a fresh admin link. |

## Project layout

```
.github/workflows/deploy.yml     test + build + publish to GitHub Pages
index.html                       page shell
src/main.ts                      UI (views + actions)
src/api.ts                       Edge Function client, token handling
src/dom.ts                       tiny DOM/dialog/toast helpers
src/strings.it.ts                all Italian UI strings + date formatting
src/style.css                    styles (mobile-first)
supabase/config.toml             CLI config (api function: verify_jwt = false)
supabase/migrations/             schema, RLS, transactional SQL functions
supabase/functions/api/          the Edge Function
supabase/functions/_shared/      draw algorithm (shared with tests)
scripts/bootstrap-admin.mjs      first-admin bootstrap
tests/draw.test.ts               draw algorithm unit tests
```

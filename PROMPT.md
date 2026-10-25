Build a small Secret Santa web app for my family (~6 people). Ask me before deviating from these decisions.

## Stack
- Frontend: static site (Vite + vanilla TypeScript, no framework), deployed to GitHub Pages via a GitHub Actions workflow. Mobile-first, simple, festive but clean.
- Backend: Supabase (Postgres + Edge Functions in Deno). No Supabase Auth.
- All data access goes through Edge Functions using the service role key. Enable RLS on every table with NO policies, so the anon key can't read anything directly.

## Access model: personal secret links (no passwords, no email)
- Each participant gets a private link: https://<site>/#t=<token>. Put the token in the URL fragment so it never reaches server logs or Referer headers.
- Token = 32 random bytes, base64url. Store only its SHA-256 hash. Every function call sends the token in a header; the function hashes it and looks up the participant.
- One participant is flagged is_admin (me). Admin sees an extra Admin section.
- Admin can regenerate any person's link; this invalidates the old one.
- Admin page has a "Send via WhatsApp" button per person. It opens https://wa.me/<phone>?text=<prefilled greeting + link>. Phone is optional; without it use https://wa.me/?text=... so I can pick the contact.
- The full link is shown only right after creation or regeneration, since we only store the hash. Make this clear in the UI.

## Data model
- participants(id, name, phone nullable, token_hash, is_admin, active, created_at)
- exclusions(participant_a, participant_b): symmetric "never draw each other" pairs, used for couples
- wishlist_items(id, participant_id, title, url nullable, notes nullable, position, created_at, updated_at)
- events(id, year unique, status 'open'|'drawn', drawn_at)
- assignments(event_id, giver_id, receiver_id), unique per (event_id, giver_id)

## Features
Everyone:
- See their own page: edit their wishlist (add/edit/delete/reorder; title required, optional link and notes).
- See ALL family members' wishlists, read-only.
- After the draw: a prominent "You're buying for <Name>" card, with that person's list highlighted. Each person sees only their own assignment.

Admin:
- Add/edit/deactivate participants. Manage couple exclusions.
- Create this year's event. Run the draw (confirm dialog). Reset the draw (strong confirm), e.g. if someone joins late.
- After the draw, the admin UI shows only "Draw completed on <date>". It must never display or return the pairings, not even in API responses.

## Draw algorithm (server-side, in an Edge Function)
- Among active participants: nobody draws themselves; nobody draws their excluded partner (both directions).
- Soft rule: avoid giving anyone the same receiver as in the previous year's event.
- Implement as randomized backtracking (shuffle, then search). First try with hard + soft rules. If impossible, retry with hard rules only and tell the admin the "no repeat" rule had to be relaxed. If even that fails, return a clear error without saving anything.
- Use crypto-secure randomness. Write the assignments in a single transaction.
- Unit-test the algorithm, including impossible cases (e.g. 2 people who are a couple) and that the repeat rule is respected when feasible.

## Reuse across years
- Participants, exclusions and wishlists persist. Each year the admin creates a new event and draws again; previous assignments are kept so the repeat rule works.

## Deliverables
- Repo with frontend, supabase/migrations, supabase/functions, tests, GitHub Actions deploy workflow.
- A seed/bootstrap script that creates the first admin participant and prints the admin link once.
- README with step-by-step setup for a non-expert: create the Supabase project, run migrations, deploy functions, set secrets, enable GitHub Pages, configure the site URL, bootstrap the admin, add family members, send links via WhatsApp.
- Note honestly in the README that the Supabase project owner could still read assignments directly in the database dashboard. The app UI and API never reveal them.

## Language
- All user-facing text (UI, buttons, confirmations, errors, WhatsApp prefilled messages) in Italian. Use informal "tu", warm family tone.
- Keep code, comments, README and commit messages in English.
- Put all UI strings in one file (e.g. src/strings.it.ts) so wording is easy to tweak later.
- Format dates in Italian (e.g. "25 dicembre 2026").
#!/usr/bin/env node
// Creates the first (admin) participant and prints their personal link once.
//
//   npm run bootstrap-admin -- --name "Your Name" [--phone "+39 333 1234567"]
//   npm run bootstrap-admin -- --regenerate     # lost your admin link? make a new one
//
// Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SITE_URL from .env.

import { createHash, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    phone: { type: "string" },
    regenerate: { type: "boolean", default: false },
  },
});

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SITE_URL) {
  fail("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SITE_URL in .env (see .env.example).");
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Must match the Edge Function: 32 random bytes, base64url; store SHA-256 hex.
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
const link = `${SITE_URL.replace(/\/*$/, "/")}#t=${token}`;

function normalizePhone(raw) {
  if (!raw?.trim()) return null;
  let digits = raw.replace(/[\s\-().\/]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^[0-9]{6,15}$/.test(digits)) fail(`Invalid phone "${raw}". Use international format, e.g. +39 333 1234567.`);
  return digits;
}

const { data: existing, error: lookupError } = await db
  .from("participants").select("id, name").eq("is_admin", true).maybeSingle();
if (lookupError) fail(`Could not reach the database: ${lookupError.message}\nDid you run the migrations?`);

if (args.regenerate) {
  if (!existing) fail("No admin exists yet. Run without --regenerate to create one.");
  const { error } = await db.from("participants").update({ token_hash: tokenHash, active: true }).eq("id", existing.id);
  if (error) fail(error.message);
  console.log(`\n✔ New admin link for ${existing.name} (the old one no longer works).`);
} else {
  if (existing) {
    fail(`An admin already exists (${existing.name}). Use --regenerate if you lost your link.`);
  }
  if (!args.name?.trim()) fail('Missing --name. Example: npm run bootstrap-admin -- --name "Your Name"');
  const { error } = await db.from("participants").insert({
    name: args.name.trim(),
    phone: normalizePhone(args.phone),
    token_hash: tokenHash,
    is_admin: true,
  });
  if (error) fail(error.message);
  console.log(`\n✔ Admin "${args.name.trim()}" created.`);
}

console.log(`
Your personal admin link (shown only now, it is not stored anywhere):

  ${link}

Open it on your phone and bookmark it. Don't share it: it gives admin access.
`);

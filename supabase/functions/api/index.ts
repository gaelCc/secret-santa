// Single Edge Function serving every Secret Santa action.
//
// Requests are `POST { action, ...params }` with the participant's secret token
// in the `x-santa-token` header. The token is hashed (SHA-256) and looked up;
// only the hash is ever stored.
//
// Privacy rule: no response ever contains assignments other than the caller's
// own receiver. Admin endpoints only report whether/when a draw happened.

import { createClient } from "npm:@supabase/supabase-js@2";
import { draw } from "../_shared/draw.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "content-type, x-santa-token, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

const MAX_ITEMS_PER_PERSON = 50;

// ---------------------------------------------------------------------------
// Helpers

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function must<T>({ data, error }: { data: T; error: { message: string; code?: string } | null }): T {
  if (error) throw error;
  return data;
}

// Maps exceptions raised by our SQL functions to API errors.
const SQL_ERRORS: Record<string, [number, string]> = {
  event_not_found: [404, "event_not_found"],
  event_already_drawn: [409, "event_already_drawn"],
  invalid_order: [400, "bad_request"],
  invalid_assignments: [500, "server_error"],
};

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalStr(value: unknown): string | null {
  const s = str(value);
  return s === "" ? null : s;
}

function uuid(value: unknown): string {
  const s = str(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    throw new ApiError(400, "bad_request");
  }
  return s.toLowerCase();
}

function parseName(value: unknown): string {
  const name = str(value);
  if (name.length < 1 || name.length > 60) throw new ApiError(400, "invalid_name");
  return name;
}

/** Digits only, international format without "+" or "00" (as wa.me expects). */
function parsePhone(value: unknown): string | null {
  const raw = str(value);
  if (raw === "") return null;
  let digits = raw.replace(/[\s\-().\/]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^[0-9]{6,15}$/.test(digits)) throw new ApiError(400, "invalid_phone");
  return digits;
}

function parseItem(params: Record<string, unknown>) {
  const title = str(params.title);
  if (title === "") throw new ApiError(400, "title_required");
  if (title.length > 200) throw new ApiError(400, "too_long");

  const url = optionalStr(params.url);
  if (url !== null) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ApiError(400, "invalid_url");
    }
    if (!["http:", "https:"].includes(parsed.protocol) || url.length > 2000) {
      throw new ApiError(400, "invalid_url");
    }
  }

  const notes = optionalStr(params.notes);
  if (notes !== null && notes.length > 1000) throw new ApiError(400, "too_long");
  return { title, url, notes };
}

// ---------------------------------------------------------------------------
// Auth

interface Me {
  id: string;
  name: string;
  is_admin: boolean;
}

async function authenticate(req: Request): Promise<Me> {
  const token = req.headers.get("x-santa-token") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ApiError(401, "invalid_token");
  const me = must(
    await db.from("participants")
      .select("id, name, is_admin")
      .eq("token_hash", await hashToken(token))
      .eq("active", true)
      .maybeSingle(),
  );
  if (!me) throw new ApiError(401, "invalid_token");
  return me as Me;
}

function requireAdmin(me: Me) {
  if (!me.is_admin) throw new ApiError(403, "forbidden");
}

// ---------------------------------------------------------------------------
// Queries

async function latestEvent() {
  return must(
    await db.from("events").select("id, year, status, drawn_at").order("year", { ascending: false }).limit(1)
      .maybeSingle(),
  );
}

async function getState(me: Me) {
  const people = must(
    await db.from("participants").select("id, name").eq("active", true).order("name"),
  ) as Array<{ id: string; name: string }>;

  const items = must(
    await db.from("wishlist_items")
      .select("id, participant_id, title, url, notes, position, updated_at")
      .in("participant_id", people.map((p) => p.id))
      .order("position")
      .order("created_at"),
  ) as Array<Record<string, unknown> & { participant_id: string }>;

  const event = await latestEvent();

  // Only ever the caller's own assignment.
  let assignment: { receiverId: string; receiverName: string } | null = null;
  if (event?.status === "drawn") {
    const row = must(
      await db.from("assignments").select("receiver_id").eq("event_id", event.id).eq("giver_id", me.id)
        .maybeSingle(),
    ) as { receiver_id: string } | null;
    if (row) {
      const receiver = must(
        await db.from("participants").select("name").eq("id", row.receiver_id).single(),
      ) as { name: string };
      assignment = { receiverId: row.receiver_id, receiverName: receiver.name };
    }
  }

  const state: Record<string, unknown> = {
    me: { id: me.id, name: me.name, isAdmin: me.is_admin },
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      items: items.filter((i) => i.participant_id === p.id).map(({ participant_id: _, ...rest }) => rest),
    })),
    event: event && { id: event.id, year: event.year, status: event.status, drawnAt: event.drawn_at },
    assignment,
  };

  if (me.is_admin) {
    state.admin = {
      participants: must(
        await db.from("participants").select("id, name, phone, is_admin, active, created_at").order("name"),
      ),
      exclusions: must(await db.from("exclusions").select("participant_a, participant_b")),
      events: must(
        await db.from("events").select("id, year, status, drawn_at").order("year", { ascending: false }),
      ),
    };
  }
  return state;
}

// ---------------------------------------------------------------------------
// Actions

type Handler = (me: Me, params: Record<string, unknown>) => Promise<unknown>;

const actions: Record<string, Handler> = {
  "state": (me) => getState(me),

  // --- Own wishlist -------------------------------------------------------

  "wishlist.add": async (me, params) => {
    const item = parseItem(params);
    const existing = must(
      await db.from("wishlist_items").select("position").eq("participant_id", me.id)
        .order("position", { ascending: false }),
    ) as Array<{ position: number }>;
    if (existing.length >= MAX_ITEMS_PER_PERSON) throw new ApiError(400, "too_many_items");
    const position = existing.length ? existing[0].position + 1 : 0;
    return must(
      await db.from("wishlist_items").insert({ ...item, participant_id: me.id, position }).select("id").single(),
    );
  },

  "wishlist.update": async (me, params) => {
    const item = parseItem(params);
    const row = must(
      await db.from("wishlist_items")
        .update({ ...item, updated_at: new Date().toISOString() })
        .eq("id", uuid(params.id))
        .eq("participant_id", me.id)
        .select("id")
        .maybeSingle(),
    );
    if (!row) throw new ApiError(404, "not_found");
    return { ok: true };
  },

  "wishlist.delete": async (me, params) => {
    must(await db.from("wishlist_items").delete().eq("id", uuid(params.id)).eq("participant_id", me.id));
    return { ok: true };
  },

  "wishlist.reorder": async (me, params) => {
    if (!Array.isArray(params.ids)) throw new ApiError(400, "bad_request");
    must(await db.rpc("santa_reorder_wishlist", { p_participant_id: me.id, p_ids: params.ids.map(uuid) }));
    return { ok: true };
  },

  // --- Admin: participants ------------------------------------------------

  "admin.participant.create": async (me, params) => {
    requireAdmin(me);
    const token = newToken();
    const participant = must(
      await db.from("participants")
        .insert({ name: parseName(params.name), phone: parsePhone(params.phone), token_hash: await hashToken(token) })
        .select("id, name, phone")
        .single(),
    );
    return { participant, token };
  },

  "admin.participant.update": async (me, params) => {
    requireAdmin(me);
    const id = uuid(params.id);
    const patch: Record<string, unknown> = {};
    if ("name" in params) patch.name = parseName(params.name);
    if ("phone" in params) patch.phone = parsePhone(params.phone);
    if ("active" in params) {
      if (typeof params.active !== "boolean") throw new ApiError(400, "bad_request");
      patch.active = params.active;
    }
    if (patch.active === false) {
      const target = must(await db.from("participants").select("is_admin").eq("id", id).maybeSingle());
      if (target?.is_admin) throw new ApiError(400, "cannot_deactivate_admin");
    }
    const row = must(await db.from("participants").update(patch).eq("id", id).select("id").maybeSingle());
    if (!row) throw new ApiError(404, "not_found");
    return { ok: true };
  },

  "admin.participant.regenerate": async (me, params) => {
    requireAdmin(me);
    const token = newToken();
    const row = must(
      await db.from("participants").update({ token_hash: await hashToken(token) }).eq("id", uuid(params.id))
        .select("id").maybeSingle(),
    );
    if (!row) throw new ApiError(404, "not_found");
    return { token };
  },

  // --- Admin: couples -----------------------------------------------------

  "admin.exclusion.add": async (me, params) => {
    requireAdmin(me);
    const [a, b] = [uuid(params.a), uuid(params.b)].sort();
    if (a === b) throw new ApiError(400, "same_person");
    must(
      await db.from("exclusions").upsert({ participant_a: a, participant_b: b }, { ignoreDuplicates: true }),
    );
    return { ok: true };
  },

  "admin.exclusion.remove": async (me, params) => {
    requireAdmin(me);
    const [a, b] = [uuid(params.a), uuid(params.b)].sort();
    must(await db.from("exclusions").delete().eq("participant_a", a).eq("participant_b", b));
    return { ok: true };
  },

  // --- Admin: events and draw ---------------------------------------------

  "admin.event.create": async (me, params) => {
    requireAdmin(me);
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError(400, "invalid_year");
    const { error } = await db.from("events").insert({ year });
    if (error?.code === "23505") throw new ApiError(409, "event_exists");
    if (error) throw error;
    return { ok: true };
  },

  "admin.draw": async (me, params) => {
    requireAdmin(me);
    const event = must(
      await db.from("events").select("id, year, status").eq("id", uuid(params.eventId)).maybeSingle(),
    );
    if (!event) throw new ApiError(404, "event_not_found");
    if (event.status !== "open") throw new ApiError(409, "event_already_drawn");

    const participants = must(
      await db.from("participants").select("id").eq("active", true),
    ) as Array<{ id: string }>;
    const exclusions = must(
      await db.from("exclusions").select("participant_a, participant_b"),
    ) as Array<{ participant_a: string; participant_b: string }>;

    // The soft "no repeat" rule looks at the most recent earlier drawn event.
    const previousEvent = must(
      await db.from("events").select("id").eq("status", "drawn").lt("year", event.year)
        .order("year", { ascending: false }).limit(1).maybeSingle(),
    );
    const previous: Record<string, string> = {};
    if (previousEvent) {
      const rows = must(
        await db.from("assignments").select("giver_id, receiver_id").eq("event_id", previousEvent.id),
      ) as Array<{ giver_id: string; receiver_id: string }>;
      for (const r of rows) previous[r.giver_id] = r.receiver_id;
    }

    const result = draw({
      participants: participants.map((p) => p.id),
      exclusions: exclusions.map((e) => [e.participant_a, e.participant_b]),
      previous,
    });
    if (!result.ok) {
      throw new ApiError(422, result.error === "too_few_participants" ? "draw_too_few" : "draw_impossible");
    }

    const givers = [...result.assignments.keys()];
    const drawnAt = must(
      await db.rpc("santa_save_draw", {
        p_event_id: event.id,
        p_givers: givers,
        p_receivers: givers.map((g) => result.assignments.get(g)!),
      }),
    );
    // Deliberately no pairings in the response.
    return { drawnAt, relaxedRepeatRule: result.relaxedRepeatRule };
  },

  "admin.reset": async (me, params) => {
    requireAdmin(me);
    must(await db.rpc("santa_reset_draw", { p_event_id: uuid(params.eventId) }));
    return { ok: true };
  },
};

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "bad_request" }, 405);

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new ApiError(400, "bad_request");
    }
    const handler = typeof body?.action === "string" ? actions[body.action] : undefined;
    if (!handler) throw new ApiError(400, "bad_request");

    const me = await authenticate(req);
    return json(await handler(me, body));
  } catch (err) {
    if (err instanceof ApiError) return json({ error: err.code }, err.status);
    const sqlError = SQL_ERRORS[(err as { message?: string })?.message ?? ""];
    if (sqlError) return json({ error: sqlError[1] }, sqlError[0]);
    // Log only the message: never request bodies or tokens.
    console.error("api error:", (err as { message?: string })?.message ?? err);
    return json({ error: "server_error" }, 500);
  }
});

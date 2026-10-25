// Thin client for the `api` Edge Function, plus personal-token handling.

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : "";
const STORAGE_KEY = "secret-santa-token";

export const isConfigured = Boolean(ENDPOINT);

export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

// --- Types returned by the API ------------------------------------------

export interface WishlistItem {
  id: string;
  title: string;
  url: string | null;
  notes: string | null;
  position: number;
}

export interface Person {
  id: string;
  name: string;
  items: WishlistItem[];
}

export interface SantaEvent {
  id: string;
  year: number;
  status: "open" | "drawn";
  drawnAt: string | null;
}

export interface AdminParticipant {
  id: string;
  name: string;
  phone: string | null;
  is_admin: boolean;
  active: boolean;
}

export interface AdminData {
  participants: AdminParticipant[];
  exclusions: Array<{ participant_a: string; participant_b: string }>;
  events: Array<{ id: string; year: number; status: "open" | "drawn"; drawn_at: string | null }>;
}

export interface State {
  me: { id: string; name: string; isAdmin: boolean };
  people: Person[];
  event: SantaEvent | null;
  assignment: { receiverId: string; receiverName: string } | null;
  admin?: AdminData;
}

// --- Token ----------------------------------------------------------------
// The token travels in the URL fragment (#t=...), which browsers never send to
// servers or in Referer headers. We also remember it locally so the app still
// works if opened without the fragment (e.g. from a home-screen shortcut).

export function readToken(): string | null {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get("t");
  if (fromHash) {
    try {
      localStorage.setItem(STORAGE_KEY, fromHash);
    } catch { /* storage unavailable: the fragment still works */ }
    return fromHash;
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

/** Builds the personal link for a token, based on where this site is served. */
export function linkFor(token: string): string {
  return `${location.origin}${location.pathname}#t=${token}`;
}

/** Switches this browser to a new token (after the admin regenerates their own link). */
export function switchToken(token: string) {
  history.replaceState(null, "", `#t=${token}`);
  readToken();
}

// --- Calls ----------------------------------------------------------------

export async function call<T = { ok: true }>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const token = readToken();
  if (!token) throw new ApiError("invalid_token");
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-santa-token": token },
      body: JSON.stringify({ ...params, action }),
    });
  } catch {
    throw new ApiError("network");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof body.error === "string" ? body.error : "server_error");
  return body as T;
}

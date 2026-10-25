// Secret Santa draw algorithm.
//
// Pure TypeScript with no runtime-specific imports, so it runs both in the
// Deno Edge Function and in the Node/Vitest unit tests.

export type Id = string;

/** Returns a uniformly distributed integer in [0, maxExclusive). */
export type RandomInt = (maxExclusive: number) => number;

export interface DrawInput {
  /** Active participant ids. Duplicates are ignored. */
  participants: Id[];
  /** Symmetric "never draw each other" pairs (e.g. couples). */
  exclusions?: Array<[Id, Id]>;
  /** Previous year's assignments, giver -> receiver. */
  previous?: Record<Id, Id>;
  /** Injectable for tests; defaults to crypto-secure randomness. */
  random?: RandomInt;
}

export type DrawResult =
  | { ok: true; assignments: Map<Id, Id>; relaxedRepeatRule: boolean }
  | { ok: false; error: "too_few_participants" | "impossible" };

type Allowed = (giver: Id, receiver: Id) => boolean;

/** Crypto-secure integer in [0, maxExclusive), using rejection sampling to avoid modulo bias. */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError(`invalid bound: ${maxExclusive}`);
  }
  const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % maxExclusive;
  }
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], random: RandomInt): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deterministic feasibility check (Kuhn's bipartite matching). Running it before
 * the randomized search means impossible inputs fail fast instead of making the
 * backtracking explore every permutation.
 */
function hasPerfectMatching(ids: Id[], allowed: Allowed): boolean {
  const matchOfReceiver = new Map<Id, Id>();
  const tryAssign = (giver: Id, seen: Set<Id>): boolean => {
    for (const receiver of ids) {
      if (!allowed(giver, receiver) || seen.has(receiver)) continue;
      seen.add(receiver);
      const current = matchOfReceiver.get(receiver);
      if (current === undefined || tryAssign(current, seen)) {
        matchOfReceiver.set(receiver, giver);
        return true;
      }
    }
    return false;
  };
  return ids.every((giver) => tryAssign(giver, new Set()));
}

/** Randomized backtracking: shuffle the givers, then try receivers in random order. */
function search(ids: Id[], allowed: Allowed, random: RandomInt): Map<Id, Id> | null {
  const givers = shuffle(ids, random);
  const taken = new Set<Id>();
  const result = new Map<Id, Id>();

  const step = (i: number): boolean => {
    if (i === givers.length) return true;
    const giver = givers[i];
    for (const receiver of shuffle(ids, random)) {
      if (taken.has(receiver) || !allowed(giver, receiver)) continue;
      taken.add(receiver);
      result.set(giver, receiver);
      if (step(i + 1)) return true;
      taken.delete(receiver);
      result.delete(giver);
    }
    return false;
  };

  return step(0) ? result : null;
}

export function draw(input: DrawInput): DrawResult {
  const ids = [...new Set(input.participants)];
  const random = input.random ?? secureRandomInt;
  if (ids.length < 2) return { ok: false, error: "too_few_participants" };

  const pairKey = (a: Id, b: Id) => `${a}\u0000${b}`;
  const excluded = new Set<string>();
  for (const [a, b] of input.exclusions ?? []) {
    excluded.add(pairKey(a, b));
    excluded.add(pairKey(b, a));
  }
  const previous = input.previous ?? {};

  const hard: Allowed = (g, r) => g !== r && !excluded.has(pairKey(g, r));
  const withNoRepeat: Allowed = (g, r) => hard(g, r) && previous[g] !== r;

  const attempts: Array<[Allowed, boolean]> = [
    [withNoRepeat, false],
    [hard, true],
  ];
  for (const [allowed, relaxedRepeatRule] of attempts) {
    if (!hasPerfectMatching(ids, allowed)) continue;
    const assignments = search(ids, allowed, random);
    if (assignments) return { ok: true, assignments, relaxedRepeatRule };
  }
  return { ok: false, error: "impossible" };
}

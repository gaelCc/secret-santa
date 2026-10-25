import { describe, expect, it } from "vitest";
import { draw, secureRandomInt, shuffle, type Id } from "../supabase/functions/_shared/draw.ts";

const FAMILY = ["anna", "bruno", "carla", "dario", "elena", "fabio"];
const RUNS = 300;

function expectValid(assignments: Map<Id, Id>, ids: Id[], exclusions: Array<[Id, Id]> = []) {
  expect([...assignments.keys()].sort()).toEqual([...ids].sort());
  expect([...assignments.values()].sort()).toEqual([...ids].sort());
  for (const [giver, receiver] of assignments) {
    expect(receiver).not.toBe(giver);
    for (const [a, b] of exclusions) {
      expect([giver, receiver].sort()).not.toEqual([a, b].sort());
    }
  }
}

describe("draw", () => {
  it("gives everyone exactly one receiver and never themselves", () => {
    for (let i = 0; i < RUNS; i++) {
      const result = draw({ participants: FAMILY });
      if (!result.ok) throw new Error("draw failed");
      expectValid(result.assignments, FAMILY);
      expect(result.relaxedRepeatRule).toBe(false);
    }
  });

  it("never pairs excluded couples, in either direction", () => {
    const couples: Array<[Id, Id]> = [["anna", "bruno"], ["carla", "dario"]];
    for (let i = 0; i < RUNS; i++) {
      const result = draw({ participants: FAMILY, exclusions: couples });
      if (!result.ok) throw new Error("draw failed");
      expectValid(result.assignments, FAMILY, couples);
    }
  });

  it("fails with too_few_participants for zero or one person", () => {
    expect(draw({ participants: [] })).toEqual({ ok: false, error: "too_few_participants" });
    expect(draw({ participants: ["anna"] })).toEqual({ ok: false, error: "too_few_participants" });
    expect(draw({ participants: ["anna", "anna"] })).toEqual({ ok: false, error: "too_few_participants" });
  });

  it("is impossible when the only two people are a couple", () => {
    const result = draw({ participants: ["anna", "bruno"], exclusions: [["anna", "bruno"]] });
    expect(result).toEqual({ ok: false, error: "impossible" });
  });

  it("is impossible when a couple can only both give to the same third person", () => {
    const result = draw({
      participants: ["anna", "bruno", "carla"],
      exclusions: [["anna", "bruno"]],
    });
    expect(result).toEqual({ ok: false, error: "impossible" });
  });

  it("is impossible when one person is excluded from everyone else", () => {
    const result = draw({
      participants: ["anna", "bruno", "carla", "dario"],
      exclusions: [["anna", "bruno"], ["anna", "carla"], ["anna", "dario"]],
    });
    expect(result).toEqual({ ok: false, error: "impossible" });
  });

  it("respects the no-repeat rule whenever it is feasible", () => {
    const previous: Record<Id, Id> = {
      anna: "bruno", bruno: "carla", carla: "dario",
      dario: "elena", elena: "fabio", fabio: "anna",
    };
    for (let i = 0; i < RUNS; i++) {
      const result = draw({ participants: FAMILY, previous });
      if (!result.ok) throw new Error("draw failed");
      expectValid(result.assignments, FAMILY);
      expect(result.relaxedRepeatRule).toBe(false);
      for (const [giver, receiver] of result.assignments) {
        expect(receiver).not.toBe(previous[giver]);
      }
    }
  });

  it("finds the single assignment that satisfies couples and no-repeat together", () => {
    // With couples A–B and C–D, A and B can only give to C or D (and vice versa).
    // Last year's pairs leave exactly one valid outcome.
    const ids = ["a", "b", "c", "d"];
    const exclusions: Array<[Id, Id]> = [["a", "b"], ["c", "d"]];
    const previous = { a: "c", b: "d", c: "a", d: "b" };
    for (let i = 0; i < 50; i++) {
      const result = draw({ participants: ids, exclusions, previous });
      if (!result.ok) throw new Error("draw failed");
      expect(result.relaxedRepeatRule).toBe(false);
      expect(Object.fromEntries(result.assignments)).toEqual({ a: "d", b: "c", c: "b", d: "a" });
    }
  });

  it("relaxes the no-repeat rule only when it has to, and says so", () => {
    const result = draw({
      participants: ["anna", "bruno"],
      previous: { anna: "bruno", bruno: "anna" },
    });
    if (!result.ok) throw new Error("draw failed");
    expect(result.relaxedRepeatRule).toBe(true);
    expect(Object.fromEntries(result.assignments)).toEqual({ anna: "bruno", bruno: "anna" });
  });

  it("ignores previous assignments involving people who are no longer participating", () => {
    const result = draw({
      participants: ["anna", "bruno", "carla"],
      previous: { anna: "zeno", zeno: "bruno" },
    });
    if (!result.ok) throw new Error("draw failed");
    expect(result.relaxedRepeatRule).toBe(false);
    expectValid(result.assignments, ["anna", "bruno", "carla"]);
  });

  it("produces different outcomes across runs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = draw({ participants: FAMILY });
      if (!result.ok) throw new Error("draw failed");
      seen.add(JSON.stringify([...result.assignments].sort()));
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it("uses the injected random source", () => {
    const always0 = () => 0;
    const a = draw({ participants: FAMILY, random: always0 });
    const b = draw({ participants: FAMILY, random: always0 });
    if (!a.ok || !b.ok) throw new Error("draw failed");
    expect([...a.assignments]).toEqual([...b.assignments]);
  });
});

describe("secureRandomInt", () => {
  it("stays within range and covers every value", () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) {
      const n = secureRandomInt(6);
      expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
      counts[n]++;
    }
    for (const c of counts) expect(c).toBeGreaterThan(0);
  });

  it("rejects invalid bounds", () => {
    expect(() => secureRandomInt(0)).toThrow(RangeError);
    expect(() => secureRandomInt(1.5)).toThrow(RangeError);
  });
});

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, secureRandomInt);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(input);
  });
});

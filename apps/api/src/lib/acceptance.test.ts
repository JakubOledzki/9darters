import { describe, expect, it } from "vitest";
import { areAllParticipantsAccepted, isPreStartMatchStatus, isResolvedMatchStatus } from "./acceptance.js";

describe("acceptance helpers", () => {
  it("requires all registered participants to accept", () => {
    expect(
      areAllParticipantsAccepted([
        { userId: "u1", status: "accepted" },
        { userId: "u2", status: "pending" }
      ])
    ).toBe(false);

    expect(
      areAllParticipantsAccepted([
        { userId: "u1", status: "accepted" },
        { userId: "u2", status: "accepted" }
      ])
    ).toBe(true);
  });

  it("treats pending and accepted as pre-start states", () => {
    expect(isPreStartMatchStatus("pending")).toBe(true);
    expect(isPreStartMatchStatus("accepted")).toBe(true);
    expect(isPreStartMatchStatus("ready")).toBe(false);
  });

  it("recognizes ready, live and finished as resolved states", () => {
    expect(isResolvedMatchStatus("ready")).toBe(true);
    expect(isResolvedMatchStatus("live")).toBe(true);
    expect(isResolvedMatchStatus("finished")).toBe(true);
    expect(isResolvedMatchStatus("pending")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import type { MembershipDomainEvent, MembershipSnapshot } from "$lib/server/membership/model";
import { createAwaitingPaymentSnapshot, replayMembershipEvents } from "$lib/server/membership/replay";

const regularTypeId = "regular";
const externalTypeId = "external";

function event<EventType extends MembershipDomainEvent["eventType"]>(
  input: Omit<Extract<MembershipDomainEvent, { eventType: EventType }>, "effectiveAt" | "recordedAt"> & {
    effectiveAt: string;
    recordedAt?: string;
  },
): Extract<MembershipDomainEvent, { eventType: EventType }> {
  return {
    ...input,
    effectiveAt: new Date(input.effectiveAt),
    recordedAt: new Date(input.recordedAt ?? input.effectiveAt),
  } as Extract<MembershipDomainEvent, { eventType: EventType }>;
}

describe("replayMembershipEvents", () => {
  it("materializes an approved first application", () => {
    const snapshot = replayMembershipEvents(createAwaitingPaymentSnapshot(regularTypeId), [
      event({
        id: "submitted",
        eventType: "application_submitted",
        effectiveAt: "2026-08-01T10:00:00Z",
        source: "system",
        certainty: "confirmed",
        data: { membershipTypeId: regularTypeId },
      }),
      event({
        id: "approved",
        eventType: "application_approved",
        effectiveAt: "2026-08-02T12:00:00Z",
        source: "admin",
        certainty: "confirmed",
        data: { membershipTypeId: regularTypeId },
      }),
    ]);

    expect(snapshot).toEqual({
      status: "active",
      membershipTypeId: regularTypeId,
      pendingMembershipTypeId: null,
      currentMembershipStartedAt: new Date("2026-08-02T12:00:00Z"),
      currentMembershipEndedAt: null,
    });
  });

  it("changes type without restarting continuous membership", () => {
    const startedAt = new Date("2025-03-01T12:00:00Z");
    const active: MembershipSnapshot = {
      status: "active",
      membershipTypeId: regularTypeId,
      pendingMembershipTypeId: null,
      currentMembershipStartedAt: startedAt,
      currentMembershipEndedAt: null,
    };

    const snapshot = replayMembershipEvents(active, [
      event({
        id: "requested",
        eventType: "type_change_requested",
        effectiveAt: "2026-08-03T10:00:00Z",
        source: "system",
        certainty: "confirmed",
        data: { fromMembershipTypeId: regularTypeId, toMembershipTypeId: externalTypeId },
      }),
      event({
        id: "changed",
        eventType: "type_changed",
        effectiveAt: "2026-08-04T10:00:00Z",
        source: "admin",
        certainty: "confirmed",
        data: { fromMembershipTypeId: regularTypeId, toMembershipTypeId: externalTypeId },
      }),
    ]);

    expect(snapshot).toEqual({
      ...active,
      membershipTypeId: externalTypeId,
      currentMembershipStartedAt: startedAt,
    });
  });

  it("ends and rejoins using the same stable snapshot", () => {
    const active: MembershipSnapshot = {
      status: "active",
      membershipTypeId: regularTypeId,
      pendingMembershipTypeId: null,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
      currentMembershipEndedAt: null,
    };

    const ended = replayMembershipEvents(active, [
      event({
        id: "resigned",
        eventType: "resigned_voluntarily",
        effectiveAt: "2025-05-01T09:00:00Z",
        source: "admin",
        certainty: "confirmed",
        data: {},
      }),
    ]);
    const awaitingPayment = {
      ...ended,
      status: "awaiting_payment" as const,
      pendingMembershipTypeId: regularTypeId,
    };
    const rejoined = replayMembershipEvents(awaitingPayment, [
      event({
        id: "approved-again",
        eventType: "application_approved",
        effectiveAt: "2026-08-10T09:00:00Z",
        source: "admin",
        certainty: "confirmed",
        data: { membershipTypeId: regularTypeId },
      }),
    ]);

    expect(ended.currentMembershipEndedAt).toEqual(new Date("2025-05-01T09:00:00Z"));
    expect(rejoined).toEqual({
      status: "active",
      membershipTypeId: regularTypeId,
      pendingMembershipTypeId: null,
      currentMembershipStartedAt: new Date("2026-08-10T09:00:00Z"),
      currentMembershipEndedAt: null,
    });
  });

  it("sorts events deterministically by effective and recorded time", () => {
    const snapshot = replayMembershipEvents(createAwaitingPaymentSnapshot(regularTypeId), [
      event({
        id: "approved",
        eventType: "application_approved",
        effectiveAt: "2026-08-02T12:00:00Z",
        source: "admin",
        certainty: "confirmed",
        data: { membershipTypeId: regularTypeId },
      }),
      event({
        id: "submitted",
        eventType: "application_submitted",
        effectiveAt: "2026-08-01T10:00:00Z",
        source: "system",
        certainty: "confirmed",
        data: { membershipTypeId: regularTypeId },
      }),
    ]);

    expect(snapshot.status).toBe("active");
  });

  it("ignores inferred transitions that conflict with confirmed state", () => {
    const initial: MembershipSnapshot = {
      status: "ended",
      membershipTypeId: regularTypeId,
      pendingMembershipTypeId: null,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
      currentMembershipEndedAt: new Date("2025-06-01T00:00:00Z"),
    };

    const snapshot = replayMembershipEvents(initial, [
      event({
        id: "inferred-end",
        eventType: "legacy_resignation_inferred",
        effectiveAt: "2025-12-01T00:00:00Z",
        source: "migration",
        certainty: "inferred",
        data: {},
      }),
    ]);

    expect(snapshot).toEqual(initial);
  });

  it("replaces a corrected decision with its recorded snapshot", () => {
    const initial: MembershipSnapshot = {
      status: "active",
      membershipTypeId: regularTypeId,
      pendingMembershipTypeId: null,
      currentMembershipStartedAt: new Date("2024-08-01T00:00:00Z"),
      currentMembershipEndedAt: null,
    };
    const correctedSnapshot: MembershipSnapshot = {
      ...initial,
      membershipTypeId: externalTypeId,
    };

    const snapshot = replayMembershipEvents(initial, [
      event({
        id: "wrong-resignation",
        eventType: "resigned_voluntarily",
        effectiveAt: "2026-08-01T00:00:00Z",
        source: "admin",
        certainty: "confirmed",
        data: {},
      }),
      event({
        id: "correction",
        eventType: "membership_decision_corrected",
        effectiveAt: "2026-08-02T00:00:00Z",
        source: "admin",
        certainty: "confirmed",
        relatedEventId: "wrong-resignation",
        data: { reason: "Wrong member selected", snapshot: correctedSnapshot },
      }),
    ]);

    expect(snapshot).toEqual(correctedSnapshot);
  });

  it("rejects invalid confirmed transitions", () => {
    expect(() =>
      replayMembershipEvents(createAwaitingPaymentSnapshot(regularTypeId), [
        event({
          id: "invalid-end",
          eventType: "expelled",
          effectiveAt: "2026-08-01T00:00:00Z",
          source: "admin",
          certainty: "confirmed",
          data: { reason: "Board decision" },
        }),
      ]),
    ).toThrow("expected status active");
  });

  it("rejects inferred event types with confirmed certainty", () => {
    expect(() =>
      replayMembershipEvents(createAwaitingPaymentSnapshot(regularTypeId), [
        event({
          id: "bad-provenance",
          eventType: "legacy_membership_started_inferred",
          effectiveAt: "2026-08-01T00:00:00Z",
          source: "migration",
          certainty: "confirmed",
          data: { membershipTypeId: regularTypeId },
        }),
      ]),
    ).toThrow("invalid certainty");
  });
});

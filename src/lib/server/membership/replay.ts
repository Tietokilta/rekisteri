import type { MembershipDomainEvent, MembershipEventType, MembershipSnapshot } from "./model";

const inferredEventTypes: ReadonlySet<MembershipEventType> = new Set([
  "legacy_membership_started_inferred",
  "legacy_resignation_inferred",
  "legacy_rejoin_inferred",
  "legacy_type_changed_inferred",
]);

export function createAwaitingPaymentSnapshot(membershipTypeId: string): MembershipSnapshot {
  return {
    status: "awaiting_payment",
    membershipTypeId: null,
    pendingMembershipTypeId: membershipTypeId,
    currentMembershipStartedAt: null,
    currentMembershipEndedAt: null,
  };
}

export function replayMembershipEvents(
  initialSnapshot: MembershipSnapshot,
  events: readonly MembershipDomainEvent[],
): MembershipSnapshot {
  validateEventProvenance(events);

  const eventIds = new Set(events.map((event) => event.id));
  const correctedEventIds = new Set(
    events
      .filter((event) => event.eventType === "membership_decision_corrected")
      .map((event) => {
        if (!event.relatedEventId || !eventIds.has(event.relatedEventId)) {
          throw new Error(`Correction ${event.id} must reference an event in the replay`);
        }
        return event.relatedEventId;
      }),
  );

  const timeline = events.filter((event) => !correctedEventIds.has(event.id)).toSorted(compareEvents);

  return timeline.reduce((snapshot, event) => {
    try {
      return applyMembershipEvent(snapshot, event);
    } catch (error) {
      if (event.certainty === "inferred") return snapshot;
      throw error;
    }
  }, initialSnapshot);
}

function applyMembershipEvent(snapshot: MembershipSnapshot, event: MembershipDomainEvent): MembershipSnapshot {
  switch (event.eventType) {
    case "application_submitted": {
      requireStatus(snapshot, event, "awaiting_payment");
      requirePendingType(snapshot, event, event.data.membershipTypeId);
      return { ...snapshot, status: "awaiting_approval" };
    }
    case "application_approved": {
      requireOneOfStatuses(snapshot, event, "awaiting_payment", "awaiting_approval");
      requirePendingType(snapshot, event, event.data.membershipTypeId);
      return {
        status: "active",
        membershipTypeId: event.data.membershipTypeId,
        pendingMembershipTypeId: null,
        currentMembershipStartedAt: event.effectiveAt,
        currentMembershipEndedAt: null,
      };
    }
    case "application_rejected": {
      requireOneOfStatuses(snapshot, event, "awaiting_payment", "awaiting_approval");
      requirePendingType(snapshot, event, event.data.membershipTypeId);
      return {
        ...snapshot,
        status: snapshot.membershipTypeId ? "ended" : "rejected",
        pendingMembershipTypeId: null,
      };
    }
    case "type_change_requested": {
      requireStatus(snapshot, event, "active");
      requireApprovedType(snapshot, event, event.data.fromMembershipTypeId);
      if (snapshot.pendingMembershipTypeId) {
        throw invalidEvent(event, "another membership type is already pending");
      }
      return { ...snapshot, pendingMembershipTypeId: event.data.toMembershipTypeId };
    }
    case "type_changed": {
      requireStatus(snapshot, event, "active");
      requireApprovedType(snapshot, event, event.data.fromMembershipTypeId);
      requirePendingType(snapshot, event, event.data.toMembershipTypeId);
      return {
        ...snapshot,
        membershipTypeId: event.data.toMembershipTypeId,
        pendingMembershipTypeId: null,
      };
    }
    case "type_change_rejected": {
      requireStatus(snapshot, event, "active");
      requireApprovedType(snapshot, event, event.data.fromMembershipTypeId);
      requirePendingType(snapshot, event, event.data.toMembershipTypeId);
      return { ...snapshot, pendingMembershipTypeId: null };
    }
    case "resigned_voluntarily":
    case "deemed_resigned_nonpayment":
    case "expelled":
    case "legacy_resignation_inferred": {
      requireStatus(snapshot, event, "active");
      return {
        ...snapshot,
        status: "ended",
        pendingMembershipTypeId: null,
        currentMembershipEndedAt: event.effectiveAt,
      };
    }
    case "legacy_membership_started_inferred":
    case "legacy_rejoin_inferred": {
      if (snapshot.status === "active") {
        throw invalidEvent(event, "cannot start an already active membership");
      }
      return {
        status: "active",
        membershipTypeId: event.data.membershipTypeId,
        pendingMembershipTypeId: null,
        currentMembershipStartedAt: event.effectiveAt,
        currentMembershipEndedAt: null,
      };
    }
    case "legacy_type_changed_inferred": {
      requireStatus(snapshot, event, "active");
      requireApprovedType(snapshot, event, event.data.fromMembershipTypeId);
      return { ...snapshot, membershipTypeId: event.data.toMembershipTypeId };
    }
    case "membership_decision_corrected":
      return structuredClone(event.data.snapshot);
  }
}

function validateEventProvenance(events: readonly MembershipDomainEvent[]) {
  const seenIds = new Set<string>();

  for (const event of events) {
    if (seenIds.has(event.id)) throw new Error(`Duplicate membership event ID: ${event.id}`);
    seenIds.add(event.id);

    const isInferredType = inferredEventTypes.has(event.eventType);
    if (isInferredType !== (event.certainty === "inferred")) {
      throw new Error(`Membership event ${event.id} has invalid certainty for ${event.eventType}`);
    }
    if (event.certainty === "inferred" && event.source !== "imported" && event.source !== "migration") {
      throw new Error(`Inferred membership event ${event.id} must come from import or migration`);
    }
  }
}

function compareEvents(left: MembershipDomainEvent, right: MembershipDomainEvent) {
  return (
    left.effectiveAt.getTime() - right.effectiveAt.getTime() ||
    left.recordedAt.getTime() - right.recordedAt.getTime() ||
    left.id.localeCompare(right.id)
  );
}

function requireStatus(
  snapshot: MembershipSnapshot,
  event: MembershipDomainEvent,
  expectedStatus: MembershipSnapshot["status"],
) {
  if (snapshot.status !== expectedStatus) {
    throw invalidEvent(event, `expected status ${expectedStatus}, got ${snapshot.status}`);
  }
}

function requireOneOfStatuses(
  snapshot: MembershipSnapshot,
  event: MembershipDomainEvent,
  ...expectedStatuses: MembershipSnapshot["status"][]
) {
  if (!expectedStatuses.includes(snapshot.status)) {
    throw invalidEvent(event, `expected status ${expectedStatuses.join(" or ")}, got ${snapshot.status}`);
  }
}

function requireApprovedType(snapshot: MembershipSnapshot, event: MembershipDomainEvent, expectedTypeId: string) {
  if (snapshot.membershipTypeId !== expectedTypeId) {
    throw invalidEvent(event, `expected approved type ${expectedTypeId}, got ${snapshot.membershipTypeId ?? "none"}`);
  }
}

function requirePendingType(snapshot: MembershipSnapshot, event: MembershipDomainEvent, expectedTypeId: string) {
  if (snapshot.pendingMembershipTypeId !== expectedTypeId) {
    throw invalidEvent(
      event,
      `expected pending type ${expectedTypeId}, got ${snapshot.pendingMembershipTypeId ?? "none"}`,
    );
  }
}

function invalidEvent(event: MembershipDomainEvent, reason: string) {
  return new Error(`Cannot apply membership event ${event.id} (${event.eventType}): ${reason}`);
}

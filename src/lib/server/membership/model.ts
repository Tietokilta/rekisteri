import { MEMBER_STATUS_VALUES } from "$lib/shared/enums";

export const MEMBERSHIP_STATUS_VALUES = MEMBER_STATUS_VALUES;

export const MEMBERSHIP_EVENT_TYPE_VALUES = [
  "application_submitted",
  "application_approved",
  "application_rejected",
  "type_change_requested",
  "type_changed",
  "type_change_rejected",
  "resigned_voluntarily",
  "deemed_resigned_nonpayment",
  "expelled",
  "legacy_membership_started_inferred",
  "legacy_resignation_inferred",
  "legacy_rejoin_inferred",
  "legacy_type_changed_inferred",
  "membership_decision_corrected",
] as const;

export const MEMBERSHIP_EVENT_SOURCE_VALUES = ["admin", "system", "imported", "migration"] as const;
export const MEMBERSHIP_EVENT_CERTAINTY_VALUES = ["confirmed", "inferred"] as const;
export const MEMBERSHIP_OBLIGATION_KIND_VALUES = ["renewal", "application", "type_change"] as const;
export const MEMBERSHIP_OBLIGATION_DISPOSITION_VALUES = ["required", "waived", "cancelled"] as const;
export const PAYMENT_SOURCE_VALUES = ["stripe", "manual", "imported"] as const;
export const PAYMENT_STATUS_VALUES = ["pending", "succeeded", "failed", "expired"] as const;
export const PAYMENT_REFUND_REASON_VALUES = [
  "application_rejected",
  "type_change_rejected",
  "duplicate_payment",
  "obsolete_obligation",
  "other",
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUS_VALUES)[number];
export type MembershipEventType = (typeof MEMBERSHIP_EVENT_TYPE_VALUES)[number];
export type MembershipEventSource = (typeof MEMBERSHIP_EVENT_SOURCE_VALUES)[number];
export type MembershipEventCertainty = (typeof MEMBERSHIP_EVENT_CERTAINTY_VALUES)[number];

export interface MembershipSnapshot {
  status: MembershipStatus;
  membershipTypeId: string | null;
  pendingMembershipTypeId: string | null;
  currentMembershipStartedAt: Date | null;
  currentMembershipEndedAt: Date | null;
}

export interface MembershipEventDataByType {
  application_submitted: { membershipTypeId: string };
  application_approved: { membershipTypeId: string };
  application_rejected: { membershipTypeId: string; reason?: string };
  type_change_requested: { fromMembershipTypeId: string; toMembershipTypeId: string };
  type_changed: { fromMembershipTypeId: string; toMembershipTypeId: string };
  type_change_rejected: { fromMembershipTypeId: string; toMembershipTypeId: string; reason?: string };
  resigned_voluntarily: { reason?: string };
  deemed_resigned_nonpayment: { reason?: string };
  expelled: { reason: string };
  legacy_membership_started_inferred: { membershipTypeId: string };
  legacy_resignation_inferred: { reason?: string };
  legacy_rejoin_inferred: { membershipTypeId: string };
  legacy_type_changed_inferred: { fromMembershipTypeId: string; toMembershipTypeId: string };
  membership_decision_corrected: { reason: string; snapshot: MembershipSnapshot };
}

export type MembershipEventData = MembershipEventDataByType[MembershipEventType];

export type MembershipDomainEvent = {
  [EventType in MembershipEventType]: {
    id: string;
    eventType: EventType;
    effectiveAt: Date;
    recordedAt: Date;
    source: MembershipEventSource;
    certainty: MembershipEventCertainty;
    relatedEventId?: string | null;
    data: MembershipEventDataByType[EventType];
  };
}[MembershipEventType];

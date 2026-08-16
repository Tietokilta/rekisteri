import * as v from "valibot";
import { getStripePriceMetadata } from "$lib/api/stripe.remote";

export const createMembershipSchema = v.pipeAsync(
  v.object({
    membershipTypeId: v.pipe(v.string(), v.minLength(1)),
    // Transform empty strings to undefined so they're treated as "not provided" (legacy membership)
    stripePriceId: v.optional(
      v.pipe(
        v.string(),
        v.transform((s) => s.trim() || undefined),
      ),
    ),
    startTime: v.pipe(v.string(), v.minLength(1)),
    endTime: v.pipe(v.string(), v.minLength(1)),
  }),
  v.check((input) => input.endTime >= input.startTime, "End date must not precede start date"),
  v.checkAsync(async (input) => {
    // If no stripePriceId provided (legacy membership), skip validation
    if (!input.stripePriceId) {
      return true;
    }
    try {
      await getStripePriceMetadata(input.stripePriceId);
      return true;
    } catch {
      return false;
    }
  }, "Invalid Stripe price ID or price not found"),
);

export const deleteMembershipSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
});

export const updateMembershipSchema = v.pipeAsync(
  v.object({
    id: v.pipe(v.string(), v.uuid()),
    membershipTypeId: v.pipe(v.string(), v.minLength(1)),
    // Transform empty strings to undefined so they're treated as "not provided"
    stripePriceId: v.optional(
      v.pipe(
        v.string(),
        v.transform((s) => s.trim() || undefined),
      ),
    ),
    startTime: v.pipe(v.string(), v.minLength(1)),
    endTime: v.pipe(v.string(), v.minLength(1)),
  }),
  v.check((input) => input.endTime >= input.startTime, "End date must not precede start date"),
  v.checkAsync(async (input) => {
    // If no stripePriceId provided (legacy membership), skip validation
    if (!input.stripePriceId) {
      return true;
    }
    try {
      await getStripePriceMetadata(input.stripePriceId);
      return true;
    } catch {
      return false;
    }
  }, "Invalid Stripe price ID or price not found"),
);

export const membershipFeePeriodIdSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });

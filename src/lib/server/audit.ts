import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import type { RequestEvent } from "@sveltejs/kit";
import { encodeBase32LowerCase } from "@oslojs/encoding";

export type AuditAction =
	| "auth.login"
	| "auth.login_failed"
	| "auth.logout"
	| "auth.passkey_registered"
	| "auth.passkey_deleted"
	| "member.approve"
	| "member.reject"
	| "member.expire"
	| "member.cancel"
	| "member.reactivate"
	| "member.create"
	| "member.bulk_approve"
	| "member.bulk_reject"
	| "member.bulk_expire"
	| "member.bulk_cancel"
	| "member.bulk_reactivate"
	| "membership.create"
	| "membership.delete";

export interface AuditLogParams {
	userId?: string;
	action: AuditAction;
	targetType?: string;
	targetId?: string;
	metadata?: Record<string, unknown>;
	ipAddress?: string;
	userAgent?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(params: AuditLogParams): Promise<void> {
	try {
		const id = encodeBase32LowerCase(crypto.getRandomValues(new Uint8Array(16)));

		await db.insert(table.auditLog).values({
			id,
			userId: params.userId || null,
			action: params.action,
			targetType: params.targetType || null,
			targetId: params.targetId || null,
			metadata: params.metadata || null,
			ipAddress: params.ipAddress || null,
			userAgent: params.userAgent || null,
		});
	} catch (error) {
		// Don't fail the operation if audit logging fails, but log the error
		console.error("[Audit] Failed to create audit log:", error);
	}
}

/**
 * Helper to create audit log from a request event
 * Uses adapter-provided client IP (respects ADDRESS_HEADER environment variable)
 * Azure App Service provides X-Client-IP header (no port, cannot be spoofed)
 * See: https://github.com/Azure/app-service-linux-docs/blob/master/Things_You_Should_Know/headers.md
 */
export async function auditFromEvent(
	event: RequestEvent,
	action: AuditAction,
	options?: {
		targetType?: string;
		targetId?: string;
		metadata?: Record<string, unknown>;
	},
): Promise<void> {
	await createAuditLog({
		userId: event.locals.user?.id,
		action,
		targetType: options?.targetType,
		targetId: options?.targetId,
		metadata: options?.metadata,
		ipAddress: event.getClientAddress(),
		userAgent: event.request.headers.get("user-agent") || undefined,
	});
}

/**
 * Audit a successful login
 */
export async function auditLogin(event: RequestEvent, userId: string): Promise<void> {
	await auditFromEvent(event, "auth.login", {
		targetType: "user",
		targetId: userId,
	});
}

/**
 * Audit a failed login attempt
 */
export async function auditLoginFailed(event: RequestEvent, email: string): Promise<void> {
	await createAuditLog({
		action: "auth.login_failed",
		metadata: { email },
		ipAddress: event.getClientAddress(),
		userAgent: event.request.headers.get("user-agent") || undefined,
	});
}

/**
 * Audit a logout
 */
export async function auditLogout(event: RequestEvent): Promise<void> {
	await auditFromEvent(event, "auth.logout");
}

/**
 * Audit a member status change
 */
export async function auditMemberAction(
	event: RequestEvent,
	action: Extract<
		AuditAction,
		"member.approve" | "member.reject" | "member.expire" | "member.cancel" | "member.reactivate"
	>,
	memberId: string,
	metadata?: Record<string, unknown>,
): Promise<void> {
	await auditFromEvent(event, action, {
		targetType: "member",
		targetId: memberId,
		metadata,
	});
}

/**
 * Audit a bulk member status change
 */
export async function auditBulkMemberAction(
	event: RequestEvent,
	action: Extract<
		AuditAction,
		| "member.bulk_approve"
		| "member.bulk_reject"
		| "member.bulk_expire"
		| "member.bulk_cancel"
		| "member.bulk_reactivate"
	>,
	memberIds: string[],
	metadata?: Record<string, unknown>,
): Promise<void> {
	await auditFromEvent(event, action, {
		targetType: "member",
		targetId: memberIds.join(","),
		metadata: {
			...metadata,
			memberIds,
			count: memberIds.length,
		},
	});
}

/**
 * Audit a passkey registration
 */
export async function auditPasskeyRegistered(
	userId: string,
	passkeyId: string,
	ipAddress?: string,
	userAgent?: string,
	metadata?: Record<string, unknown>,
): Promise<void> {
	await createAuditLog({
		userId,
		action: "auth.passkey_registered",
		targetType: "passkey",
		targetId: passkeyId,
		metadata,
		ipAddress,
		userAgent,
	});
}

/**
 * Audit a passkey deletion
 */
export async function auditPasskeyDeleted(
	userId: string,
	passkeyId: string,
	ipAddress?: string,
	userAgent?: string,
): Promise<void> {
	await createAuditLog({
		userId,
		action: "auth.passkey_deleted",
		targetType: "passkey",
		targetId: passkeyId,
		ipAddress,
		userAgent,
	});
}

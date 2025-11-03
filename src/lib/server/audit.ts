import { db } from "$lib/server/db";
import * as table from "$lib/server/db/schema";
import type { RequestEvent } from "@sveltejs/kit";
import { encodeBase32LowerCase } from "@oslojs/encoding";

export type AuditAction =
	| "auth.login"
	| "auth.login_failed"
	| "auth.logout"
	| "member.approve"
	| "member.reject"
	| "member.expire"
	| "member.cancel"
	| "member.reactivate"
	| "member.create"
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
 * Get client IP from request, handling Azure App Service proxy
 */
function getClientIP(request: Request): string {
	const forwardedFor = request.headers.get("X-Forwarded-For");
	// Azure App Service adds real client IP to rightmost position
	return (
		forwardedFor
			?.split(",")
			.map((ip) => ip.trim())
			.pop() || "unknown"
	);
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
		ipAddress: getClientIP(event.request),
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
		ipAddress: getClientIP(event.request),
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

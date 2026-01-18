import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, "child"> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

export type NonEmptyArray<T> = [T, ...T[]];
export const isNonEmpty = <T>(arr: T[] | undefined | null): arr is NonEmptyArray<T> => {
	return Array.isArray(arr) && arr.length > 0;
};

/**
 * Format a price in cents to a localized currency string using Intl.NumberFormat.
 */
export function formatPrice(priceCents: number, currency: string, locale: string): string {
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(priceCents / 100);
}

/**
 * Format a date range to a localized string (e.g., "1.8.2024 – 31.7.2025").
 */
export function formatDateRange(start: Date, end: Date, locale: string): string {
	const startStr = start.toLocaleDateString(`${locale}-FI`, { day: "numeric", month: "numeric", year: "numeric" });
	const endStr = end.toLocaleDateString(`${locale}-FI`, { day: "numeric", month: "numeric", year: "numeric" });
	return `${startStr} – ${endStr}`;
}

/**
 * Format a date range without year on start date (e.g., "1.8. – 31.7.2025").
 * Useful when the year is already displayed elsewhere (e.g., in a group header).
 */
export function formatShortDateRange(start: Date, end: Date, locale: string): string {
	const startStr = start.toLocaleDateString(`${locale}-FI`, { day: "numeric", month: "numeric" });
	const endStr = end.toLocaleDateString(`${locale}-FI`, { day: "numeric", month: "numeric", year: "numeric" });
	return `${startStr} – ${endStr}`;
}

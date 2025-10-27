import type { Locales } from './i18n-types'

export const locales = ['fi', 'en'] as const satisfies readonly Locales[]
export const baseLocale = 'fi' as const satisfies Locales

export type Locale = typeof locales[number]

export function getLocaleFromPathname(pathname: string): Locale {
	const segments = pathname.split('/')
	const maybeLocale = segments[1]

	if (maybeLocale && locales.includes(maybeLocale as Locale)) {
		return maybeLocale as Locale
	}

	return baseLocale
}

export function stripLocaleFromPathname(pathname: string): string {
	const segments = pathname.split('/')
	const maybeLocale = segments[1]

	if (maybeLocale && locales.includes(maybeLocale as Locale)) {
		return '/' + segments.slice(2).join('/')
	}

	return pathname
}

export function localizePathname(pathname: string, locale: Locale): string {
	const stripped = stripLocaleFromPathname(pathname)
	return `/${locale}${stripped === '/' ? '' : stripped}`
}

import { describe, it, expect } from 'vitest';
import { validateRedirect, getDefaultRedirect } from './redirect';

describe('validateRedirect', () => {
	const origin = 'https://rekisteri.tietokilta.fi';

	it('should allow same-origin pathnames', () => {
		expect(validateRedirect('/admin/members', origin)).toBe('/admin/members');
		expect(validateRedirect('/meetings/shared/abc123', origin)).toBe('/meetings/shared/abc123');
		expect(validateRedirect('/settings', origin)).toBe('/settings');
		expect(validateRedirect('/', origin)).toBe('/');
	});

	it('should preserve query strings and hash', () => {
		expect(validateRedirect('/settings?tab=profile', origin)).toBe('/settings?tab=profile');
		expect(validateRedirect('/admin?page=2#section', origin)).toBe('/admin?page=2#section');
		expect(validateRedirect('/meetings#top', origin)).toBe('/meetings#top');
	});

	it('should allow same-origin full URLs', () => {
		expect(validateRedirect('https://rekisteri.tietokilta.fi/admin', origin)).toBe('/admin');
		expect(validateRedirect('https://rekisteri.tietokilta.fi/settings?tab=profile', origin)).toBe('/settings?tab=profile');
	});

	it('should block different origins', () => {
		expect(validateRedirect('https://evil.com', origin)).toBeNull();
		expect(validateRedirect('https://evil.com/admin', origin)).toBeNull();
		expect(validateRedirect('http://rekisteri.tietokilta.fi', origin)).toBeNull(); // Different protocol
	});

	it('should block protocol-relative URLs', () => {
		expect(validateRedirect('//evil.com', origin)).toBeNull();
		expect(validateRedirect('//evil.com/admin', origin)).toBeNull();
	});

	it('should block javascript: URLs', () => {
		expect(validateRedirect('javascript:alert(1)', origin)).toBeNull();
		expect(validateRedirect('javascript:void(0)', origin)).toBeNull();
	});

	it('should block data: URLs', () => {
		expect(validateRedirect('data:text/html,<script>alert(1)</script>', origin)).toBeNull();
		expect(validateRedirect('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', origin)).toBeNull();
	});

	it('should handle null or empty redirects', () => {
		expect(validateRedirect(null, origin)).toBeNull();
		expect(validateRedirect('', origin)).toBeNull();
	});

	it('should handle malformed URLs', () => {
		// URL constructor treats these as relative paths (which is valid for redirects)
		// They get URL-encoded: 'not a valid url' → '/not%20a%20valid%20url'
		expect(validateRedirect('not a valid url', origin)).toBe('/not%20a%20valid%20url');

		// These do throw errors and should return null
		expect(validateRedirect('http://', origin)).toBeNull();
	});

	it('should handle localhost in development', () => {
		const devOrigin = 'http://localhost:4173';
		expect(validateRedirect('/admin', devOrigin)).toBe('/admin');
		expect(validateRedirect('http://localhost:4173/admin', devOrigin)).toBe('/admin');
		expect(validateRedirect('http://localhost:4174/admin', devOrigin)).toBeNull(); // Different port
	});

	it('should block subdomain attacks', () => {
		expect(validateRedirect('https://evil.rekisteri.tietokilta.fi', origin)).toBeNull();
		expect(validateRedirect('https://rekisteri.tietokilta.fi.evil.com', origin)).toBeNull();
	});
});

describe('getDefaultRedirect', () => {
	it('should return home for regular users', () => {
		expect(getDefaultRedirect(false)).toBe('/');
	});

	it('should return home for admins', () => {
		// Currently always returns home, could be extended later
		expect(getDefaultRedirect(true)).toBe('/');
	});
});

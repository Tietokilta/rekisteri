export class RefillingTokenBucket<_Key> {
	public max: number;
	public refillIntervalSeconds: number;

	constructor(max: number, refillIntervalSeconds: number) {
		this.max = max;
		this.refillIntervalSeconds = refillIntervalSeconds;
	}

	private storage = new Map<_Key, RefillBucket>();

	/**
	 * Clean up fully refilled buckets to prevent memory leaks.
	 * Only removes buckets that have been idle for at least 10 minutes.
	 */
	public cleanup(): void {
		const now = Date.now();
		const TEN_MINUTES = 600 * 1000;

		for (const [key, bucket] of this.storage.entries()) {
			const refill = Math.floor((now - bucket.refilledAt) / (this.refillIntervalSeconds * 1000));
			const currentCount = Math.min(bucket.count + refill, this.max);
			// Remove buckets that are fully refilled AND haven't been used in 10+ minutes
			if (currentCount >= this.max && now - bucket.refilledAt > TEN_MINUTES) {
				this.storage.delete(key);
			}
		}
	}

	public check(key: _Key, cost: number): boolean {
		const bucket = this.storage.get(key) ?? null;
		if (bucket === null) {
			return true;
		}
		const now = Date.now();
		const refill = Math.floor((now - bucket.refilledAt) / (this.refillIntervalSeconds * 1000));
		if (refill > 0) {
			return Math.min(bucket.count + refill, this.max) >= cost;
		}
		return bucket.count >= cost;
	}

	public consume(key: _Key, cost: number): boolean {
		let bucket = this.storage.get(key) ?? null;
		const now = Date.now();
		if (bucket === null) {
			bucket = {
				count: this.max - cost,
				refilledAt: now,
			};
			this.storage.set(key, bucket);
			return true;
		}
		const refill = Math.floor((now - bucket.refilledAt) / (this.refillIntervalSeconds * 1000));
		bucket.count = Math.min(bucket.count + refill, this.max);
		bucket.refilledAt = now;
		if (bucket.count < cost) {
			return false;
		}
		bucket.count -= cost;
		this.storage.set(key, bucket);
		return true;
	}
}

export class Throttler<_Key> {
	public timeoutSeconds: number[];

	private storage = new Map<_Key, ThrottlingCounter>();

	constructor(timeoutSeconds: number[]) {
		this.timeoutSeconds = timeoutSeconds;
	}

	/**
	 * Clean up old throttling counters to prevent memory leaks.
	 * Should be called periodically (e.g., every 10 minutes).
	 */
	public cleanup(): void {
		const now = Date.now();
		const maxTimeout = Math.max(...this.timeoutSeconds);
		for (const [key, counter] of this.storage.entries()) {
			// Remove counters that haven't been updated in a while
			if (now - counter.updatedAt > maxTimeout * 1000 * 2) {
				this.storage.delete(key);
			}
		}
	}

	public consume(key: _Key): boolean {
		let counter = this.storage.get(key) ?? null;
		const now = Date.now();
		if (counter === null) {
			counter = {
				timeout: 0,
				updatedAt: now,
			};
			this.storage.set(key, counter);
			return true;
		}
		const allowed = now - counter.updatedAt >= this.timeoutSeconds[counter.timeout] * 1000;
		if (!allowed) {
			return false;
		}
		counter.updatedAt = now;
		counter.timeout = Math.min(counter.timeout + 1, this.timeoutSeconds.length - 1);
		this.storage.set(key, counter);
		return true;
	}

	public reset(key: _Key): void {
		this.storage.delete(key);
	}
}

export class ExpiringTokenBucket<_Key> {
	public max: number;
	public expiresInSeconds: number;

	private storage = new Map<_Key, ExpiringBucket>();

	constructor(max: number, expiresInSeconds: number) {
		this.max = max;
		this.expiresInSeconds = expiresInSeconds;
	}

	/**
	 * Clean up expired buckets to prevent memory leaks.
	 * Should be called periodically (e.g., every 10 minutes).
	 */
	public cleanup(): void {
		const now = Date.now();
		for (const [key, bucket] of this.storage.entries()) {
			// Remove buckets that have expired
			if (now - bucket.createdAt >= this.expiresInSeconds * 1000) {
				this.storage.delete(key);
			}
		}
	}

	public check(key: _Key, cost: number): boolean {
		const bucket = this.storage.get(key) ?? null;
		const now = Date.now();
		if (bucket === null) {
			return true;
		}
		if (now - bucket.createdAt >= this.expiresInSeconds * 1000) {
			return true;
		}
		return bucket.count >= cost;
	}

	public consume(key: _Key, cost: number): boolean {
		let bucket = this.storage.get(key) ?? null;
		const now = Date.now();
		if (bucket === null) {
			bucket = {
				count: this.max - cost,
				createdAt: now,
			};
			this.storage.set(key, bucket);
			return true;
		}
		if (now - bucket.createdAt >= this.expiresInSeconds * 1000) {
			// Reset the bucket with a new time window
			bucket.count = this.max;
			bucket.createdAt = now;
		}
		if (bucket.count < cost) {
			return false;
		}
		bucket.count -= cost;
		this.storage.set(key, bucket);
		return true;
	}

	public reset(key: _Key): void {
		this.storage.delete(key);
	}
}

interface RefillBucket {
	count: number;
	refilledAt: number;
}

interface ExpiringBucket {
	count: number;
	createdAt: number;
}

interface ThrottlingCounter {
	timeout: number;
	updatedAt: number;
}

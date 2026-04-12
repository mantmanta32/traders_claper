// utils/cache.js

class Cache {
    constructor(ttl) {
        this.ttl = ttl; // time to live in milliseconds
        this.cache = new Map();
    }

    set(key, value) {
        const now = Date.now();
        const expiration = now + this.ttl;
        this.cache.set(key, { value, expiration });
    }

    get(key) {
        const cached = this.cache.get(key);
        const now = Date.now();

        if (!cached) {
            return null; // Cache miss
        }

        if (cached.expiration < now) {
            this.cache.delete(key); // Remove expired item
            return null; // Cache miss
        }

        return cached.value; // Cache hit
    }
}

module.exports = Cache;
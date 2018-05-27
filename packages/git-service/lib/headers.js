"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Simple helper class for easier managing HTTP headers.
 */
class Headers {
    constructor(input) {
        Object.defineProperty(this, "count", {
            get() {
                return this.__raw.size;
            },
        });
        if (input instanceof Headers) {
            this.__raw = new Map(input);
        }
        else {
            this.__raw = new Map();
            if (input instanceof Array || input instanceof Map) {
                for (const [header, value] of input) {
                    this.append(header, value);
                }
            }
            else if (typeof input === "object") {
                for (const [header, value] of Object.entries(input)) {
                    this.append(header, value);
                }
            }
        }
    }
    /**
     * Returns the first value for header.
     * @param header Header name
     */
    get(header) {
        const values = this.getAll(header);
        if (values) {
            return values[0];
        }
    }
    /**
     * Returns all values for header.
     * @param header Header name
     */
    getAll(header) {
        return this.__raw.get(sanitizeHeader(header));
    }
    /**
     * Sets value for header. All other values will be removed.
     * @param header   Header name
     * @param value  Header value to set
     */
    set(header, value) {
        const saneHeader = sanitizeHeader(header);
        this.__raw.set(saneHeader, []);
        this.__append(saneHeader, value);
    }
    /**
     *  Appends value for header.
     * @param header Header name
     * @param value Header value to append
     */
    append(header, value) {
        this.__append(sanitizeHeader(header), value);
    }
    __append(saneHeader, value) {
        if (!this.__raw.has(saneHeader)) {
            this.__raw.set(saneHeader, []);
        }
        const values = this.__raw.get(saneHeader);
        if (value instanceof Array) {
            values.push(...value);
        }
        else {
            values.push(`${value}`);
        }
    }
    /**
     * Checks if collection has header.
     * @param header Header name
     */
    has(header) {
        return this.__raw.has(sanitizeHeader(header));
    }
    /**
     * Deletes header and accossiated values.
     * @param header Header name
     */
    delete(header) {
        return this.__raw.delete(sanitizeHeader(header));
    }
    /**
     * Iterates over all header-values pair.
     * @param fn Callback
     * @param thisArg Value of `this` in `fn`
     */
    forEach(fn, thisArg) {
        this.__raw.forEach((v, k) => fn.call(thisArg, k, v));
    }
    /**
     * Returns an iterator for all header-values pairs in collection.
     */
    entries() {
        return this.__raw.entries();
    }
    /**
     * Used by for-of loops.
     */
    [Symbol.iterator]() {
        return this.__raw.entries();
    }
    /**
     * Convert data to a JSON-friendly format.
     */
    toJSON() {
        const headers = {};
        for (const [key, value] of this.__raw) {
            if (value.length === 1) {
                headers[key] = value[0];
            }
            else if (value.length) {
                headers[key] = value.slice();
            }
        }
        return headers;
    }
}
exports.Headers = Headers;
function sanitizeHeader(header) {
    header += "";
    if (/[^_`a-zA-Z\-0-9!#-'*+.|~]/.test(header)) {
        throw new TypeError(`${header} is not a legal HTTP header name`);
    }
    return header.toLowerCase();
}
//# sourceMappingURL=headers.js.map
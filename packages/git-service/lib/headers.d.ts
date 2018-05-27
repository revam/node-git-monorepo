/// <reference types="node" />
import { OutgoingHttpHeaders } from "http";
/**
 * Valid inputs for Headers class constructor
 */
export declare type HeadersInput = Headers | Map<string, number | string | string[]> | Array<[string, number | string | string[]]> | OutgoingHttpHeaders;
/**
 * Simple helper class for easier managing HTTP headers.
 */
export declare class Headers {
    /**
     * Number of headers in collection.
     */
    readonly count: number;
    private __raw;
    constructor(input?: HeadersInput);
    /**
     * Returns the first value for header.
     * @param header Header name
     */
    get(header: any): string;
    /**
     * Returns all values for header.
     * @param header Header name
     */
    getAll(header: any): string[];
    /**
     * Sets value for header. All other values will be removed.
     * @param header   Header name
     * @param value  Header value to set
     */
    set(header: string, value: number | string | string[]): void;
    /**
     *  Appends value for header.
     * @param header Header name
     * @param value Header value to append
     */
    append(header: string, value: number | string | string[]): void;
    private __append(saneHeader, value);
    /**
     * Checks if collection has header.
     * @param header Header name
     */
    has(header: string): boolean;
    /**
     * Deletes header and accossiated values.
     * @param header Header name
     */
    delete(header: string): boolean;
    /**
     * Iterates over all header-values pair.
     * @param fn Callback
     * @param thisArg Value of `this` in `fn`
     */
    forEach<T = undefined>(fn: (this: T, header: string, value: string[]) => any, thisArg?: T): void;
    /**
     * Returns an iterator for all header-values pairs in collection.
     */
    entries(): IterableIterator<[string, string[]]>;
    /**
     * Used by for-of loops.
     */
    [Symbol.iterator](): IterableIterator<[string, string[]]>;
    /**
     * Convert data to a JSON-friendly format.
     */
    toJSON(): OutgoingHttpHeaders;
}

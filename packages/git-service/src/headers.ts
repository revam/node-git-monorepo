import { OutgoingHttpHeaders } from "http";

/**
 * Valid inputs for Headers class constructor
 */
export type HeadersInput = Headers
  | Map<string, number | string | string[]>
  | Array<[string, number | string | string[]]>
  | OutgoingHttpHeaders;

/**
 * Simple helper class for easier managing HTTP headers.
 */
export class Headers {
  /**
   * Number of headers in collection.
   */
  public get count(): number {
    return this.__raw.size;
  }

  private readonly __raw: Map<string, string[]>;

  public constructor(input?: HeadersInput) {
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
  public get(header: string) {
    const values = this.getAll(header);
    if (values) {
      return values[0];
    }
  }

  /**
   * Returns all values for header.
   * @param header Header name
   */
  public getAll(header: string) {
    return this.__raw.get(sanitizeHeader(header));
  }

  /**
   * Sets value for header. All other values will be removed.
   * @param header   Header name
   * @param value  Header value to set
   */
  public set(header: string, value?: number | string | string[]) {
    if (value !== undefined) {
      const saneHeader = sanitizeHeader(header);
      this.__raw.set(saneHeader, []);
      this.__append(saneHeader, value);
    }
  }

  /**
   *  Appends value for header.
   * @param header Header name
   * @param value Header value to append
   */
  public append(header: string, value?: number | string | string[]) {
    if (value !== undefined) {
      const saneHeader = sanitizeHeader(header);
      if (!this.__raw.has(saneHeader)) {
        this.__raw.set(saneHeader, []);
      }
      this.__append(saneHeader, value);
    }
  }

  private __append(saneHeader: string, value: number | string | string[]) {
    const values = this.__raw.get(saneHeader)!;
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
  public has(header: string): boolean {
    return this.__raw.has(sanitizeHeader(header));
  }

  /**
   * Deletes header and accossiated values.
   * @param header Header name
   */
  public delete(header: string): boolean {
    return this.__raw.delete(sanitizeHeader(header));
  }

  /**
   * Iterates over all header-values pair.
   * @param fn Callback
   * @param thisArg Value of `this` in `fn`
   */
  public forEach<T = never>(fn: (this: T, header: string, value: string[]) => any, thisArg?: T) {
    this.__raw.forEach((v, k) => fn.call(thisArg, k, v));
  }

  /**
   * Returns an iterator for all header-values pairs in collection.
   */
  public entries(): IterableIterator<[string, string[]]> {
    return this.__raw.entries();
  }

  /**
   * Used by for-of loops.
   */
  public [Symbol.iterator](): IterableIterator<[string, string[]]> {
    return this.__raw.entries();
  }

  /**
   * Convert data to a JSON-friendly format.
   */
  public toJSON(): OutgoingHttpHeaders {
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

function sanitizeHeader(header: string) {
  header += "";
  if (/[^_`a-zA-Z\-0-9!#-'*+.|~]/.test(header)) {
    throw new TypeError(`${header} is not a legal HTTP header name`);
  }
  return header.toLowerCase();
}

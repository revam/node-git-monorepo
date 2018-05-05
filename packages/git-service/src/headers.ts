import { OutgoingHttpHeaders } from "http";
import { IHeaders } from "./interfaces";

export { Headers as default };

/**
 * Valid inputs for Headers class constructor
 */
export type HeadersInput = Headers
  | Map<string, number | string | string[]>
  | Array<[string, number | string | string[]]>
  | OutgoingHttpHeaders;

/**
 * Simple class implementing IHeaders
 */
export class Headers implements IHeaders {
  private __raw: Map<string, string[]>;
  constructor(input?: HeadersInput) {
    if (input instanceof Headers) {
      this.__raw = new Map(input);
    } else {
      this.__raw = new Map();
      if (input instanceof Array || input instanceof Map) {
        for (const [header, value] of input) {
          this.append(header, value);
        }
      } else if (typeof input === "object") {
        for (const header of Object.keys(input)) {
          this.append(header, input[header]);
        }
      }
    }
  }
  public get count() { return this.__raw.size; }
  public get(header) { return this.__raw.get(sanitizeHeader(header))!.join(","); }
  public set(header, value) {
    const saneHeader = sanitizeHeader(header);
    this.__raw.set(saneHeader, []);
    this.append(saneHeader, value);
  }
  public has(header) { return this.__raw.has(sanitizeHeader(header)); }
  public delete(header) { return this.__raw.delete(sanitizeHeader(header)); }
  public append(header, value) {
    const saneHeader = sanitizeHeader(header);
    if (!this.__raw.has(saneHeader)) {
      this.__raw.set(saneHeader, []);
    }
    const values = this.__raw.get(saneHeader);
    if (value instanceof Array) {
      values.push(...value);
    } else {
      values.push(`${value}`);
    }
  }
  public forEach<T>(fn, thisArg) { this.__raw.forEach((v, k) => fn.call(thisArg, k, v)); }
  public keys() { return this.__raw.keys(); }
  public values() { return this.__raw.values(); }
  public entries() { return this.__raw.entries(); }
  public [Symbol.iterator]() { return this.__raw.entries(); }
}

function sanitizeHeader(header: string) {
  header += "";
  if (!/^[^_`a-zA-Z\-0-9!#-'*+.|~]*$/.test(header)) {
    throw new TypeError(`${header} is not a legal HTTP header name`);
  }
  return header.toLowerCase();
}

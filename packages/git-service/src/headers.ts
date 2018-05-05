import { IHeaders } from "./interfaces";

export { Headers as default };

/**
 * Valid inputs for Headers class constructor
 */
export type HeadersInput = Headers | Map<string, string[]> | string[][] | {[key: string]: string | string[]};

/**
 * Simple class implementing IHeaders
 */
export class Headers implements IHeaders {
  private __raw: Map<string, string[]>;
  constructor(input?: HeadersInput) {
    if (input instanceof Headers || input instanceof Map) {
      this.__raw = new Map(input);
    } else {
      this.__raw = new Map();
      if (input instanceof Array && input.length > 1) {
        for (const [header, ...values] of input) {
          for (const value of values) {
            this.append(header, value);
          }
        }
      } else if (typeof input === "object") {
        for (const header of Object.keys(input)) {
          const values = input[header];
          if (values instanceof Array) {
            for (const value of values) {
              this.append(header, value);
            }
          } else {
            this.append(header, values);
          }
        }
      }
    }
  }
  public get(header) { return this.__raw.get(sanitizeHeader(header))!.join(','); }
  public set(header, value) { this.__raw.set(sanitizeHeader(header), [value]); }
  public has(header) { return this.__raw.has(sanitizeHeader(header)); }
  public delete(header) { return this.__raw.delete(sanitizeHeader(header)); }
  public append(header, value) { this.__raw.get(sanitizeHeader(header))!.push(value); }
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

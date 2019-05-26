import { TextDecoder, TextEncoder } from "util";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf8", { fatal: true, ignoreBOM: true });

export function encode(source: string): Uint8Array {
  return ENCODER.encode(source);
}

export function decode(source: Uint8Array): string {
  return DECODER.decode(source);
}

export function concat(buffers: Uint8Array[]): Uint8Array {
  const length = buffers.reduce((p, i) => p + i.length, 0);
  const result = new Uint8Array(length);
  buffers.reduce((p, i) => { result.set(i, p); return p + i.length; }, 0);
  return result;
}

/**
 * Compare if two buffers are equal to each other.
 *
 * @param buf1 - The first buffer to compare.
 * @param buf2 - The second buffer to compare.
 */
export function compare(buf1: Uint8Array, buf2: Uint8Array): boolean {
  if (buf1.length !== buf2.length) {
    return false;
  }
  // Short circuit
  for (let i = 0; i < buf1.byteLength; i += 1) {
    if (buf1[i] !== buf2[i]) {
      return false;
    }
  }
  return true;
}

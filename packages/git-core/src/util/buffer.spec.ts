import * as lib from "./buffer";

test("test and function compare(), function decode(), function encode()", () => {
  const pairs = new Map<string, Uint8Array>([
    ["", new Uint8Array()],
    ["\x30\x30\x30\x30", new Uint8Array([48, 48, 48, 48])],
  ]);
  for (const [source, encodedResult] of pairs) {
    const encodedSource = lib.encode(source);
    const result = lib.decode(encodedResult);
    expect(lib.compare(encodedSource, encodedResult)).toBe(true);
    expect(source).toBe(result);
  }
});

test("test function compare(), function encode()", () => {
  const a = lib.encode("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  const b = lib.encode("ABCDFEGHJILKNMPORQTSVUXWZY");
  const c1 = lib.encode("ABC");
  const c2 = lib.encode("ABC");

  expect(lib.compare(a, b)).toBe(false);
  expect(lib.compare(a, c1)).toBe(false);
  expect(lib.compare(a, c2)).toBe(false);

  expect(lib.compare(b, c1)).toBe(false);
  expect(lib.compare(b, c2)).toBe(false);

  expect(lib.compare(c1, c2)).toBe(true);
});

test("test function compare(), function concat()", () => {
  const sources = [
    new Uint8Array([]),
  ];
  const result = new Uint8Array([]);
  const concated = lib.concat(sources);
  expect(lib.compare(concated, result)).toBe(true);
});

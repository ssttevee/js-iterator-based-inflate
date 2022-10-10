export function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const buf = new Uint8Array(a.length + b.length);
  buf.set(a, 0);
  buf.set(b, a.length);
  return buf;
}

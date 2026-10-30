// Finding an extension in a store's item list by name. Store names often add
// a tagline after a dash or colon, so the brand part also counts, but only
// when exactly one item has it.
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const brand = (s: string) => norm(s.split(/\s[–—-]\s|:\s/)[0] ?? s);

export function matchName<T>(name: string, items: T[], nameOf: (item: T) => string): T | null {
  const exact = items.filter((i) => norm(nameOf(i)) === norm(name));
  if (exact.length === 1) return exact[0]!;
  const byBrand = items.filter((i) => brand(nameOf(i)) === brand(name));
  return byBrand.length === 1 ? byBrand[0]! : null;
}

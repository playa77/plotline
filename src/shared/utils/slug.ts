/**
 * Slug and version-slug utilities.
 *
 * Slugs are kebab-case identifiers derived from user-facing names. The
 * `versionSlug` function additionally handles collision resolution against a
 * set of existing slugs, appending a numeric suffix on conflict.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

/**
 * Convert any string to kebab-case.
 *
 * - Lowercases the input
 * - Replaces non-alphanumeric characters (except hyphens) with hyphens
 * - Collapses runs of multiple hyphens
 * - Trims leading/trailing hyphens
 *
 * @example slugify('My Cool Version')   // => 'my-cool-version'
 * @example slugify('café & bistro')     // => 'cafe-bistro'
 * @example slugify('already-kebab')     // => 'already-kebab'
 * @example slugify('!!!hello!!!')       // => 'hello'
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')                 // decompose accented chars: "é" → "e" + combining acute
    .replace(/[\u0300-\u036f]/g, '')  // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, ' ') // non-alphanumeric (except hyphen) → space
    .replace(/\s+/g, '-')        // whitespace runs → hyphen
    .replace(/-+/g, '-')         // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');   // trim leading/trailing hyphens
}

/**
 * Convert a version name to a kebab-case slug, guaranteed unique within the
 * provided set of existing slugs. On collision, appends a numeric suffix
 * (starting at -1, then -2, etc.).
 *
 * @param name - The user-facing version name (e.g. "My Version", "main")
 * @param existingSlugs - Slugs already in use for this chapter
 * @returns A unique kebab-case slug
 *
 * @example versionSlug('test', [])                    // => 'test'
 * @example versionSlug('test', ['test'])              // => 'test-1'
 * @example versionSlug('test', ['test', 'test-1'])    // => 'test-2'
 * @example versionSlug('my version', ['my-version'])  // => 'my-version-1'
 */
export function versionSlug(name: string, existingSlugs: string[]): string {
  const base = slugify(name);

  if (!existingSlugs.includes(base)) {
    return base;
  }

  // Find the lowest non-negative suffix that doesn't collide
  let suffix = 1;
  while (existingSlugs.includes(`${base}-${suffix}`)) {
    suffix++;
  }

  return `${base}-${suffix}`;
}

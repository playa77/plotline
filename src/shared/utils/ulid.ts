/**
 * ULID generation and validation.
 *
 * ULIDs are sortable, URL-safe, 26-character identifiers used throughout the
 * application as the primary key type for all entities (projects, chapters,
 * sections, variables, etc.). They are preferred over UUID v4 because they
 * are lexicographically sortable by creation time and fit in URLs without
 * escaping.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

import { monotonicFactory } from 'ulid';

/** ULID character regex: 26 upper-case alphanumeric chars (no vowels). */
const ULID_RE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

/** Monotonic ULID factory — guarantees strictly increasing values. */
const monotonic = monotonicFactory();

/**
 * Generate a new ULID.
 * Uses the `ulid` library's monotonic factory, so within the same millisecond
 * successive calls produce increasing values.
 */
export function generateULID(): string {
  return monotonic();
}

/**
 * Validate that a string is a well-formed ULID.
 * Returns `true` for 26-char ULIDs matching the Crockford base32 alphabet
 * (no vowels, no `I`, `L`, `O`, `U`).
 */
export function isValidULID(id: string): boolean {
  return ULID_RE.test(id);
}

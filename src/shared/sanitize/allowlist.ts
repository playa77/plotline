/**
 * Single source of truth for Substack-safe HTML elements and attributes.
 *
 * The editor structurally cannot produce output outside this subset, and the
 * sanitizer (§6.3 tech spec) enforces this at export. Any change here is a
 * cross-cutting concern — widen the set only after an R3 decision.
 *
 * @module
 * @version 1.0.0 | 2026-07-16
 */

export const ALLOWED_ELEMENTS = [
  'h2', 'h3', 'h4', 'p', 'strong', 'em', 's',
  'a', 'blockquote', 'ul', 'ol', 'li', 'hr',
  'img', 'figure', 'figcaption', 'pre', 'code', 'br',
] as const;

export type AllowedElement = (typeof ALLOWED_ELEMENTS)[number];

export const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href'],              // http, https, mailto only
  img: ['src', 'alt'],      // project-relative or https
  figure: [],
  figcaption: [],
};

export type AllowedAttributeMap = typeof ALLOWED_ATTRIBUTES;

export const ALLOWED_HREF_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

export type AllowedHrefProtocol = (typeof ALLOWED_HREF_PROTOCOLS)[number];

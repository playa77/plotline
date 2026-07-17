/**
 * TemplateEngine — prompt template loading, placeholder substitution,
 * and prompt assembly (TS §4).
 *
 * Templates are loaded from two sources, in priority order:
 *   1. Project override (Git on `refs/heads/main`, under `templates/<id>/`)
 *   2. Built-in (files under `src/main/templates/` on disk)
 *
 * Placeholder resolution supports:
 *   - `{{placeholder}}` — simple substitution (empty string if missing)
 *   - `{{#if placeholder}}...{{/if}}` — conditional blocks (elided when
 *     the placeholder is falsy or empty)
 *
 * Version: 0.1.0 | 2026-07-16
 */

import fs from 'node:fs';
import path from 'node:path';
import type { StorageService } from '../storage/StorageService';

// ── Exported types ────────────────────────────────────────────────────────────

export interface TemplateMeta {
  id: string;
  version: string;
  step: 'expand' | 'write' | 'iterate';
  description: string;
}

export interface Template {
  meta: TemplateMeta;
  systemPrompt: string;
  userPrompt: string;
}

export interface AssemblyContext {
  bookOutline?: string;
  chapterSlice?: string;
  storyVariables?: string;
  upstreamArtifact?: string;
  currentArtifact?: string;
  instruction?: string;
  continuityContext?: string;
  wordTarget?: string;
  outputFormatContract?: string;
}

export interface AssembledPrompt {
  templateId: string;
  templateVersion: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Placeholders recognised by the template engine (TS §4.2). */
export const ALLOWED_PLACEHOLDERS = new Set([
  'book_outline',
  'chapter_slice',
  'story_variables',
  'upstream_artifact',
  'current_artifact',
  'instruction',
  'continuity_context',
  'word_target',
  'output_format_contract',
  'section_slice',
]);

/**
 * Default output format contract used when `output_format_contract` is
 * missing from the assembly context.
 */
export const DEFAULT_OUTPUT_FORMAT_CONTRACT = [
  'OUTPUT FORMAT: You must output bare Substack-safe HTML only.',
  'No markdown, no code fences, no HTML wrapper (no <html>, <head>, or <body> tags).',
  'Your entire response must be valid HTML fragment using only:',
  'h2, h3, h4, p, strong, em, s, a, blockquote, ul, ol, li, hr, img, figure, figcaption, pre, code, br.',
].join('\n');

/** Built-in templates directory, resolved relative to this module. */
const BUILT_IN_TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

// ── TemplateEngine ───────────────────────────────────────────────────────────

export class TemplateEngine {
  private readonly templatesDir: string;

  /**
   * @param templatesDir - Optional override for the built-in templates
   *                       directory. Used in tests; defaults to the
   *                       `src/main/templates/` build output directory.
   */
  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir ?? BUILT_IN_TEMPLATES_DIR;
  }

  /**
   * Load a template by step or explicit ID.
   *
   * Resolution order:
   *   1. Project override from Git (requires `projectId` + `service`)
   *   2. Built-in from the filesystem
   *
   * @param step       - Workflow step used to derive the default template ID
   *                     (`<step>-v1`) when `templateId` is omitted.
   * @param projectId  - Optional project ID for project-override lookup.
   * @param service    - Optional StorageService for reading from the project
   *                     Git repo.
   * @param templateId - Optional explicit template ID; defaults to `<step>-v1`.
   *
   * @throws If no template can be found.
   */
  async loadTemplate(
    step: 'expand' | 'write' | 'iterate',
    projectId?: string,
    service?: StorageService,
    templateId?: string,
  ): Promise<Template> {
    const resolvedTemplateId = templateId ?? `${step}-v1`;

    // Priority 1: project override (Git on main)
    if (projectId && service) {
      try {
        return await this.loadProjectTemplate(service, resolvedTemplateId);
      } catch {
        // Not found in project — fall through to built-in
      }
    }

    // Priority 2: built-in
    return this.loadBuiltInTemplate(resolvedTemplateId);
  }

  /**
   * Resolve placeholders in a template string.
   *
   * Two-pass algorithm:
   *   1. Handle `{{#if placeholder}}...{{/if}}` conditional blocks.
   *      If the placeholder resolves to a truthy non-empty string, the inner
   *      content is kept (with its own placeholders resolved); otherwise the
   *      block is elided.
   *   2. Handle `{{placeholder}}` simple substitutions. Unknown placeholders
   *      throw with code `UNKNOWN_PLACEHOLDER`.
   *
   * @throws `Error('UNKNOWN_PLACEHOLDER: {{name}}')` for unrecognised placeholders.
   */
  resolvePlaceholders(template: string, context: Record<string, string>): string {
    // Pass 1: conditional blocks
    let result = template.replace(
      /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
      (_match, name: string, innerContent: string) => {
        const val = context[name];
        if (val && val.length > 0) {
          // Resolve placeholders within the conditional block recursively
          return this.resolvePlaceholders(innerContent, context);
        }
        return '';
      },
    );

    // Pass 2: simple substitutions
    result = result.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      if (!ALLOWED_PLACEHOLDERS.has(name)) {
        throw new Error(`UNKNOWN_PLACEHOLDER: {{${name}}}`);
      }
      return context[name] ?? '';
    });

    return result;
  }

  /**
   * Assemble a full prompt from a loaded template plus context.
   *
   * 1. Injects the default `output_format_contract` if not present in context.
   * 2. Resolves placeholders in `system.txt` → system message.
   * 3. Resolves placeholders in `user.txt` → user message.
   *
   * @returns An `AssembledPrompt` with template provenance.
   * @throws If any unknown placeholder is encountered during resolution.
   */
  assemble(template: Template, context: Record<string, string>): AssembledPrompt {
    // Provide default output format contract
    const fullContext: Record<string, string> = { ...context };
    if (!fullContext.output_format_contract) {
      fullContext.output_format_contract = DEFAULT_OUTPUT_FORMAT_CONTRACT;
    }

    const systemContent = this.resolvePlaceholders(template.systemPrompt, fullContext);
    const userContent = this.resolvePlaceholders(template.userPrompt, fullContext);

    return {
      templateId: template.meta.id,
      templateVersion: template.meta.version,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Load a built-in template from the filesystem.
   *
   * @throws If the template directory or required files are missing.
   */
  private loadBuiltInTemplate(templateId: string): Template {
    const dir = path.join(this.templatesDir, templateId);

    const metaPath = path.join(dir, 'template.json');
    const systemPath = path.join(dir, 'system.txt');
    const userPath = path.join(dir, 'user.txt');

    if (!fs.existsSync(metaPath)) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const metaRaw = fs.readFileSync(metaPath, 'utf-8');
    const meta: TemplateMeta = JSON.parse(metaRaw);

    if (!fs.existsSync(systemPath) || !fs.existsSync(userPath)) {
      throw new Error(`Template files missing for: ${templateId}`);
    }

    const systemPrompt = fs.readFileSync(systemPath, 'utf-8');
    const userPrompt = fs.readFileSync(userPath, 'utf-8');

    return { meta, systemPrompt, userPrompt };
  }

  /**
   * Load a project-override template from the Git repo.
   *
   * Files are read from `templates/<templateId>/` on `refs/heads/main`.
   *
   * @throws If any file cannot be read (propagated from StorageService).
   */
  private async loadProjectTemplate(
    service: StorageService,
    templateId: string,
  ): Promise<Template> {
    const prefix = `templates/${templateId}`;

    const [metaBuf, systemBuf, userBuf] = await Promise.all([
      service.readBlob('refs/heads/main', `${prefix}/template.json`),
      service.readBlob('refs/heads/main', `${prefix}/system.txt`),
      service.readBlob('refs/heads/main', `${prefix}/user.txt`),
    ]);

    const meta: TemplateMeta = JSON.parse(metaBuf.toString('utf-8'));

    return {
      meta,
      systemPrompt: systemBuf.toString('utf-8'),
      userPrompt: userBuf.toString('utf-8'),
    };
  }
}

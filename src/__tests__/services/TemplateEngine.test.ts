/**
 * TemplateEngine tests (WP-12).
 *
 * Tests placeholder resolution, conditional blocks, template loading
 * (built-in and project-override), and full prompt assembly.
 *
 * Version: 0.1.0 | 2026-07-16
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  TemplateEngine,
  ALLOWED_PLACEHOLDERS,
  DEFAULT_OUTPUT_FORMAT_CONTRACT,
  type Template,
  type TemplateMeta,
} from '../../main/services/TemplateEngine';
import { ProjectService } from '../../main/services/ProjectService';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Fixture helpers ────────────────────────────────────────────────────────────

/**
 * Create a temporary templates directory with the given template data.
 * Returns the temp dir path and a cleanup function.
 */
function createTemplateDir(): {
  dir: string;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-templates-'));
  return {
    dir,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Write a template into a templates directory.
 */
function writeTemplate(
  templatesDir: string,
  templateId: string,
  meta: Partial<TemplateMeta> & { id: string; step: 'expand' | 'write' | 'iterate' },
  systemText: string,
  userText: string,
): void {
  const templateDir = path.join(templatesDir, templateId);
  fs.mkdirSync(templateDir, { recursive: true });

  const fullMeta: TemplateMeta = {
    id: meta.id,
    version: meta.version ?? '1.0.0',
    step: meta.step,
    description: meta.description ?? 'Test template',
  };

  fs.writeFileSync(
    path.join(templateDir, 'template.json'),
    JSON.stringify(fullMeta, null, 2),
  );
  fs.writeFileSync(path.join(templateDir, 'system.txt'), systemText, 'utf-8');
  fs.writeFileSync(path.join(templateDir, 'user.txt'), userText, 'utf-8');
}

// ── Placeholder resolution ─────────────────────────────────────────────────────

describe('TemplateEngine — placeholders', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('replaces a simple {{placeholder}} with its context value', () => {
    const result = engine.resolvePlaceholders('Hello {{chapter_slice}}', { chapter_slice: 'World' });
    expect(result).toBe('Hello World');
  });

  it('replaces a {{placeholder}} matching ALLOWED_PLACEHOLDERS', () => {
    // Use an actual allowed placeholder
    const result = engine.resolvePlaceholders('Outline: {{book_outline}}', {
      book_outline: 'Chapter 1',
    });
    expect(result).toBe('Outline: Chapter 1');
  });

  it('throws UNKNOWN_PLACEHOLDER for an unrecognised placeholder', () => {
    expect(() =>
      engine.resolvePlaceholders('{{unknown_field}}', {}),
    ).toThrow('UNKNOWN_PLACEHOLDER: {{unknown_field}}');
  });

  it('replaces missing optional placeholder with empty string', () => {
    const result = engine.resolvePlaceholders('{{chapter_slice}}', {
      book_outline: 'exists',
    });
    expect(result).toBe('');
  });

  it('replaces multiple placeholders in one template', () => {
    const result = engine.resolvePlaceholders(
      '{{book_outline}} and {{chapter_slice}}',
      { book_outline: 'Outline', chapter_slice: 'Slice' },
    );
    expect(result).toBe('Outline and Slice');
  });

  it('throws on first unknown placeholder with multiple placeholders', () => {
    expect(() =>
      engine.resolvePlaceholders('{{book_outline}} {{bad}} {{also_bad}}', {
        book_outline: 'ok',
      }),
    ).toThrow('UNKNOWN_PLACEHOLDER: {{bad}}');
  });
});

// ── Conditional blocks ─────────────────────────────────────────────────────────

describe('TemplateEngine — conditionals', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  it('{{#if}} with truthy value includes inner content', () => {
    const result = engine.resolvePlaceholders(
      'Before{{#if chapter_slice}} INNER {{chapter_slice}}{{/if}}After',
      { chapter_slice: 'yes' },
    );
    expect(result).toBe('Before INNER yesAfter');
  });

  it('{{#if}} with empty string elides the block', () => {
    const result = engine.resolvePlaceholders(
      'Before{{#if chapter_slice}}INNER{{/if}}After',
      { chapter_slice: '' },
    );
    expect(result).toBe('BeforeAfter');
  });

  it('{{#if}} with missing key elides the block', () => {
    const result = engine.resolvePlaceholders(
      'Before{{#if chapter_slice}}INNER{{/if}}After',
      {},
    );
    expect(result).toBe('BeforeAfter');
  });

  it('{{#if}} with "0" (truthy string) includes the block', () => {
    const result = engine.resolvePlaceholders(
      '{{#if instruction}}{{instruction}}{{/if}}',
      { instruction: '0' },
    );
    expect(result).toBe('0');
  });

  it('placeholders inside a conditional block are resolved', () => {
    const result = engine.resolvePlaceholders(
      '{{#if chapter_slice}}Content: {{chapter_slice}}{{/if}}',
      { chapter_slice: 'Chap 1' },
    );
    expect(result).toBe('Content: Chap 1');
  });

  it('multiple conditionals in one template are handled', () => {
    const result = engine.resolvePlaceholders(
      'A{{#if book_outline}}BO{{/if}}B{{#if chapter_slice}}CS{{/if}}C{{#if missing}}X{{/if}}D',
      { book_outline: 'y', chapter_slice: '' },
    );
    expect(result).toBe('ABOBCD');
  });

  it('conditional with all false branches produces empty output', () => {
    const result = engine.resolvePlaceholders(
      '{{#if missing}}SHOULD_NOT_APPEAR{{/if}}',
      {},
    );
    expect(result).toBe('');
  });
});

// ── Template loading ───────────────────────────────────────────────────────────

describe('TemplateEngine — loading', () => {
  let templatesDir: string;
  let cleanup: () => void;
  let engine: TemplateEngine;

  beforeEach(() => {
    const dir = createTemplateDir();
    templatesDir = dir.dir;
    cleanup = dir.cleanup;

    writeTemplate(
      templatesDir,
      'expand-v1',
      { id: 'expand-v1', version: '1.0.0', step: 'expand', description: 'Expand template' },
      'System: expand {{book_outline}}',
      'User: expand {{chapter_slice}}',
    );

    writeTemplate(
      templatesDir,
      'write-v1',
      { id: 'write-v1', version: '1.0.0', step: 'write', description: 'Write template' },
      'System: write {{story_variables}}',
      'User: write {{instruction}}',
    );

    engine = new TemplateEngine(templatesDir);
  });

  afterEach(() => {
    cleanup();
  });

  it('loads a built-in template by step', async () => {
    const template = await engine.loadTemplate('expand');
    expect(template.meta.id).toBe('expand-v1');
    expect(template.meta.version).toBe('1.0.0');
    expect(template.meta.step).toBe('expand');
    expect(template.systemPrompt).toBe('System: expand {{book_outline}}');
    expect(template.userPrompt).toBe('User: expand {{chapter_slice}}');
  });

  it('loads a built-in template by explicit template ID', async () => {
    const template = await engine.loadTemplate('expand', undefined, undefined, 'write-v1');
    expect(template.meta.id).toBe('write-v1');
    expect(template.meta.step).toBe('write');
  });

  it('throws Template not found for nonexistent ID', async () => {
    await expect(
      engine.loadTemplate('expand', undefined, undefined, 'nonexistent-v99'),
    ).rejects.toThrow(/Template not found/i);
  });

  it('throws for missing template files', async () => {
    // Create a directory with template.json but no .txt files
    const badDir = path.join(templatesDir, 'bad-template');
    fs.mkdirSync(badDir);
    fs.writeFileSync(
      path.join(badDir, 'template.json'),
      JSON.stringify({ id: 'bad-template', version: '1.0.0', step: 'expand', description: 'Bad' }),
    );

    await expect(
      engine.loadTemplate('expand', undefined, undefined, 'bad-template'),
    ).rejects.toThrow(/Template files missing/i);
  });
});

// ── Project override loading ───────────────────────────────────────────────────

describe('TemplateEngine — project override', () => {
  let templatesDir: string;
  let cleanupTemplates: () => void;
  let projectTmpDir: string;
  let projectService: ProjectService;
  let engine: TemplateEngine;

  beforeEach(async () => {
    const td = createTemplateDir();
    templatesDir = td.dir;
    cleanupTemplates = td.cleanup;

    projectTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plotline-test-project-override-'));
    projectService = new ProjectService(projectTmpDir);
    engine = new TemplateEngine(templatesDir);

    // Create a project with a project-override template in Git
    const project = await projectService.create('Override Test');
    const service = projectService.getOpenProject(project.projectId)!;

    // Write template files to the Git repo
    await service.commit(
      'refs/heads/main',
      {
        'templates/custom-v1/template.json': Buffer.from(
          JSON.stringify({
            id: 'custom-v1',
            version: '2.0.0',
            step: 'expand',
            description: 'Custom override',
          }),
          'utf-8',
        ),
        'templates/custom-v1/system.txt': Buffer.from('Custom system: {{book_outline}}', 'utf-8'),
        'templates/custom-v1/user.txt': Buffer.from('Custom user: {{chapter_slice}}', 'utf-8'),
      },
      { label: 'Add custom template', kind: 'manual' },
    );

    // Also write a built-in template to test fallback
    writeTemplate(
      templatesDir,
      'expand-v1',
      { id: 'expand-v1', version: '1.0.0', step: 'expand', description: 'Built-in expand' },
      'Built-in system',
      'Built-in user',
    );
  });

  afterEach(() => {
    cleanupTemplates();
    fs.rmSync(projectTmpDir, { recursive: true, force: true });
  });

  it('loads project-override template when service is provided', async () => {
    const project = projectService.getCurrentProject()!;
    const service = projectService.getOpenProject(project.id)!;

    const template = await engine.loadTemplate('expand', project.id, service, 'custom-v1');
    expect(template.meta.id).toBe('custom-v1');
    expect(template.meta.version).toBe('2.0.0');
    expect(template.systemPrompt).toBe('Custom system: {{book_outline}}');
    expect(template.userPrompt).toBe('Custom user: {{chapter_slice}}');
  });

  it('falls back to built-in when project override is not found', async () => {
    const project = projectService.getCurrentProject()!;
    const service = projectService.getOpenProject(project.id)!;

    // custom-v2 does not exist in the project repo, but expand-v1 exists as built-in
    const template = await engine.loadTemplate('expand', project.id, service);
    expect(template.meta.id).toBe('expand-v1');
    expect(template.systemPrompt).toBe('Built-in system');
  });

  it('loadTemplate ignores projectId when service is omitted', async () => {
    // Without a service, it should go directly to built-in
    const template = await engine.loadTemplate('expand', 'some-project-id');
    expect(template.meta.id).toBe('expand-v1');
  });
});

// ── Assembly ───────────────────────────────────────────────────────────────────

describe('TemplateEngine — assembly', () => {
  let engine: TemplateEngine;
  let template: Template;

  const testMeta: TemplateMeta = {
    id: 'test-v1',
    version: '1.0.0',
    step: 'expand',
    description: 'Test',
  };

  beforeEach(() => {
    engine = new TemplateEngine();
    template = {
      meta: testMeta,
      systemPrompt: 'You are a writer.\n\n{{output_format_contract}}',
      userPrompt: 'Outline: {{book_outline}}\n\nVariables:\n{{story_variables}}',
    };
  });

  it('returns correct messages array with system and user roles', () => {
    const result = engine.assemble(template, {
      book_outline: 'Chapter 1',
      story_variables: 'Tone: formal',
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]!.role).toBe('system');
    expect(result.messages[1]!.role).toBe('user');
  });

  it('includes template provenance (id, version)', () => {
    const result = engine.assemble(template, {
      book_outline: 'Chapter 1',
    });

    expect(result.templateId).toBe('test-v1');
    expect(result.templateVersion).toBe('1.0.0');
  });

  it('injects default output_format_contract when not provided', () => {
    const result = engine.assemble(template, {
      book_outline: 'Chapter 1',
    });

    expect(result.messages[0]!.content).toContain('OUTPUT FORMAT');
    expect(result.messages[0]!.content).toContain('Substack-safe HTML');
  });

  it('uses provided output_format_contract over default', () => {
    const customContract = 'CUSTOM OUTPUT FORMAT';
    const result = engine.assemble(template, {
      book_outline: 'Chapter 1',
      output_format_contract: customContract,
    });

    expect(result.messages[0]!.content).toContain(customContract);
    expect(result.messages[0]!.content).not.toContain('OUTPUT FORMAT: You must');
  });

  it('resolves placeholders in both system and user prompts', () => {
    const result = engine.assemble(template, {
      book_outline: 'Chap 1',
      story_variables: 'Tone: formal',
    });

    expect(result.messages[0]!.content).toContain('You are a writer');
    expect(result.messages[0]!.content).toContain(DEFAULT_OUTPUT_FORMAT_CONTRACT);
    expect(result.messages[1]!.content).toContain('Chap 1');
    expect(result.messages[1]!.content).toContain('Tone: formal');
  });

  it('throws for unknown placeholder during assembly', () => {
    const badTemplate: Template = {
      meta: testMeta,
      systemPrompt: '{{unknown_bad}}',
      userPrompt: 'ok',
    };

    expect(() => engine.assemble(badTemplate, {})).toThrow(
      'UNKNOWN_PLACEHOLDER: {{unknown_bad}}',
    );
  });

  it('user message contains resolved content (not raw placeholders)', () => {
    const result = engine.assemble(template, {
      book_outline: 'Prologue',
      story_variables: 'Style: descriptive',
    });

    const userMsg = result.messages[1]!.content;
    expect(userMsg).toContain('Prologue');
    expect(userMsg).toContain('Style: descriptive');
    expect(userMsg).not.toContain('{{book_outline}}');
    expect(userMsg).not.toContain('{{story_variables}}');
  });
});

// ── ALLOWED_PLACEHOLDERS ──────────────────────────────────────────────────────

describe('TemplateEngine — ALLOWED_PLACEHOLDERS', () => {
  it('contains all ten expected placeholders', () => {
    const expected = [
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
    ];

    for (const name of expected) {
      expect(ALLOWED_PLACEHOLDERS.has(name)).toBe(true);
    }

    expect(ALLOWED_PLACEHOLDERS.size).toBe(expected.length);
  });
});

// ── DEFAULT_OUTPUT_FORMAT_CONTRACT ────────────────────────────────────────────

describe('TemplateEngine — default contract', () => {
  it('contains key elements', () => {
    expect(DEFAULT_OUTPUT_FORMAT_CONTRACT).toContain('Substack-safe HTML');
    expect(DEFAULT_OUTPUT_FORMAT_CONTRACT).toContain('no code fences');
    expect(DEFAULT_OUTPUT_FORMAT_CONTRACT).toContain('figure');
  });
});

// ── Built-in templates — WP-13 ───────────────────────────────────────────────

/**
 * Test context used for snapshot resolution of all built-in templates.
 * Every placeholder that appears across any template is represented here.
 */
const TEST_CONTEXT = {
  book_outline:
    '## Part I — Test\n### Chapter 1: Beginning\n...',
  chapter_slice:
    '### Chapter 1: Beginning\n**Target: 7,000–8,000 words**\n#### 1.1 Opening *(1,200 words)*\n- First beat\n- Second beat',
  story_variables:
    '=== STORY VARIABLE: Tone (core) ===\nAuthoritative and engaging\n=== END VARIABLE ===\n\n=== STORY VARIABLE: Style (core) ===\nClear and direct\n=== END VARIABLE ===',
  upstream_artifact:
    '<h3>Expanded Section 1.1</h3><p>The opening scene establishes...</p>',
  current_artifact:
    '<h3>Section 1.1</h3><p>The old version of this text...</p>',
  instruction:
    'Rewrite section 1.1 to be more dramatic and add a hook at the end',
  continuity_context:
    '<p>The previous chapter ended with the protagonist discovering a crucial clue hidden in an old photograph...</p>',
  word_target: '7,000–8,000 words',
  output_format_contract:
    'OUTPUT FORMAT: Bare Substack-safe HTML only. No markdown, no code fences. Valid HTML fragment using allowed elements.',
};

/** Allowed placeholder sets per step (TS §4.2). */
const STEP_ALLOWED_PLACEHOLDERS: Record<string, ReadonlySet<string>> = {
  expand: new Set([
    'book_outline',
    'chapter_slice',
    'story_variables',
    'word_target',
    'output_format_contract',
  ]),
  write: new Set([
    'chapter_slice',
    'upstream_artifact',
    'story_variables',
    'continuity_context',
    'word_target',
    'output_format_contract',
  ]),
  iterate: new Set([
    'current_artifact',
    'upstream_artifact',
    'story_variables',
    'instruction',
    'output_format_contract',
  ]),
};

const BUILT_IN_TEMPLATES_DIR = path.join(process.cwd(), 'src/main/templates');

/**
 * Extract all simple placeholder names (not {{#if}} or {{/if}} directives)
 * from a template string.
 */
function extractPlaceholders(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const placeholders: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    placeholders.push(match[1]!);
  }
  return placeholders;
}

describe('Built-in templates — snapshots', () => {
  const engine = new TemplateEngine(BUILT_IN_TEMPLATES_DIR);

  const steps = ['expand', 'write', 'iterate'] as const;

  for (const step of steps) {
    describe(`${step}-v1`, () => {
      let template: Template;

      beforeAll(async () => {
        template = await engine.loadTemplate(step);
      });

      it('system.txt resolves without error', () => {
        const resolved = engine.resolvePlaceholders(
          template.systemPrompt,
          TEST_CONTEXT,
        );
        expect(resolved).toMatchSnapshot(`${step}-v1 system`);
      });

      it('user.txt resolves without error', () => {
        const resolved = engine.resolvePlaceholders(
          template.userPrompt,
          TEST_CONTEXT,
        );
        expect(resolved).toMatchSnapshot(`${step}-v1 user`);
      });
    });
  }
});

describe('Built-in templates — placeholder lint', () => {
  const engine = new TemplateEngine(BUILT_IN_TEMPLATES_DIR);

  const steps = ['expand', 'write', 'iterate'] as const;

  for (const step of steps) {
    describe(`${step}-v1`, () => {
      let template: Template;

      beforeAll(async () => {
        template = await engine.loadTemplate(step);
      });

      it('system.txt uses only allowed placeholders', () => {
        const placeholders = extractPlaceholders(template.systemPrompt);
        const allowed = STEP_ALLOWED_PLACEHOLDERS[step]!;
        for (const ph of placeholders) {
          expect(allowed.has(ph)).toBe(true);
        }
      });

      it('user.txt uses only allowed placeholders', () => {
        const placeholders = extractPlaceholders(template.userPrompt);
        const allowed = STEP_ALLOWED_PLACEHOLDERS[step]!;
        for (const ph of placeholders) {
          expect(allowed.has(ph)).toBe(true);
        }
      });

      it('template.json has correct step', () => {
        expect(template.meta.step).toBe(step);
        expect(template.meta.id).toBe(`${step}-v1`);
        if (template.meta.id === 'expand-v1') {
          expect(template.meta.version).toBe('1.1.0');
        } else {
          expect(template.meta.version).toBe('1.0.0');
        }
      });
    });
  }
});

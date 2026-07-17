/**
 * ExportService tests (WP-23, WP-25).
 *
 * Tests cover clipboard and file export modes, error conditions, sanitization,
 * plaintext fallback, Markdown export, and PDF export via LaTeX+Tectonic.
 * Uses mocked StorageService (via ProjectService), mocked Electron clipboard,
 * and mocked fs operations.
 *
 * Version: 0.2.0 | 2026-07-17
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks (must be before any imports that use them) ─────────────

vi.mock('electron', () => ({
  clipboard: {
    write: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../main/services/tex/htmlToLatex', () => ({
  htmlToLatex: vi.fn((html: string) => `[LATEX:${html.slice(0, 50)}]`),
  escapeLatex: vi.fn((text: string) => text),
}));

vi.mock('../../main/services/tex/TectonicRunner', () => ({
  TectonicRunner: vi.fn().mockImplementation(() => ({
    render: vi.fn().mockResolvedValue('/tmp/plotline-pdf-12345/export.pdf'),
  })),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────

import { ExportService } from '../../main/services/ExportService';
import { clipboard } from 'electron';
import { writeFileSync, readFileSync, copyFileSync } from 'node:fs';

// ── Fixtures ────────────────────────────────────────────────────────────

const MOCK_PROJECT_MANIFEST = {
  schemaVersion: 1,
  projectId: 'test-project',
  title: 'Test Book',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  settings: {
    continuityContext: { enabled: true, words: 500 },
    models: {
      expand: { provider: 'openai', model: 'gpt-4' },
      write: { provider: 'openai', model: 'gpt-4' },
      iterate: { provider: 'openai', model: 'gpt-4' },
      parse: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
    },
    inference: { baseUrl: 'https://api.openai.com/v1' },
  },
  structure: [
    {
      kind: 'part',
      id: 'part_001',
      title: 'Part One',
      chapters: [
        {
          id: 'test-chapter',
          title: 'The Beginning',
          selectedVersion: 'main',
          versions: [
            { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
          ],
          wordTarget: null,
        },
        {
          id: 'chapter-with-version',
          title: 'Versioned Chapter',
          selectedVersion: 'draft',
          versions: [
            { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
            { slug: 'draft', name: 'Draft', createdAt: '2026-01-02T00:00:00.000Z', createdFrom: null, archived: false },
          ],
          wordTarget: null,
        },
      ],
    },
  ],
};

const CHAPTER_HTML_FIXTURE = `<h2>Chapter 1</h2>
<p>This is the opening paragraph of the chapter.</p>
<p>With <strong>bold</strong> and <em>italic</em> text.</p>
<ul>
  <li>Item one</li>
  <li>Item two</li>
</ul>`;

const DISALLOWED_ELEMENTS_FIXTURE = `<h2>Clean Title</h2>
<script>alert('xss')</script>
<p>Safe paragraph with <strong>bold</strong>.</p>
<div>
  <p>Inside div — only the p should survive</p>
</div>
<img src="https://example.com/img.png" alt="test" />
<iframe src="https://evil.com"></iframe>
<div>Bare text in div should be stripped</div>`;

// ── Helper ──────────────────────────────────────────────────────────────

function createMockProjectService(
  readBlobImpl: (ref: string, filepath: string) => Buffer,
) {
  const mockReadBlob = vi.fn().mockImplementation(readBlobImpl);

  const mockStorageService = { readBlob: mockReadBlob };
  const mockGetOpenProject = vi.fn().mockReturnValue(mockStorageService);

  return {
    getOpenProject: mockGetOpenProject,
    mockReadBlob,
    mockStorageService,
  };
}

// ── Suite ───────────────────────────────────────────────────────────────

describe('ExportService', () => {
  let exportService: ExportService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Clipboard mode ───────────────────────────────────────────────────

  describe('clipboard mode', () => {
    it('resolves artifact, sanitizes it, writes to clipboard with both html and text properties', async () => {
      const { getOpenProject, mockReadBlob } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
            return Buffer.from(CHAPTER_HTML_FIXTURE, 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      const result = await exportService.exportSubstack(
        'test-project',
        'test-chapter',
        undefined,
        'clipboard',
      );

      expect(result).toEqual({ ok: true });

      // clipboard.write should have been called with html and text
      expect(clipboard.write).toHaveBeenCalledTimes(1);
      const clipboardCall = (clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;
      expect(clipboardCall).toHaveProperty('html');
      expect(clipboardCall).toHaveProperty('text');

      // HTML should be sanitized but still contain allowed elements
      expect(clipboardCall.html).toContain('<h2>');
      expect(clipboardCall.html).toContain('<p>');
      expect(clipboardCall.html).toContain('<strong>');
      expect(clipboardCall.html).toContain('<em>');

      // Should have read the project.json and chapter.html
      expect(mockReadBlob).toHaveBeenCalledWith('refs/heads/main', 'project.json');
      expect(mockReadBlob).toHaveBeenCalledWith(
        'refs/plotline/chapters/test-chapter/main',
        'chapter.html',
      );
    });

    it('uses explicit versionSlug when provided', async () => {
      const { getOpenProject, mockReadBlob } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/plotline/chapters/test-chapter/draft' && filepath === 'chapter.html') {
            return Buffer.from('<p>Draft content</p>', 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await exportService.exportSubstack(
        'test-project',
        'test-chapter',
        'draft',
        'clipboard',
      );

      expect(mockReadBlob).toHaveBeenCalledWith(
        'refs/plotline/chapters/test-chapter/draft',
        'chapter.html',
      );

      expect(clipboard.write).toHaveBeenCalledTimes(1);
    });

    it('throws NO_ARTIFACT if chapter.html does not exist', async () => {
      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          throw new Error('not found');
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await expect(
        exportService.exportSubstack('test-project', 'test-chapter', undefined, 'clipboard'),
      ).rejects.toEqual({
        code: 'NO_ARTIFACT',
        message: 'Chapter has no written artifact to export',
      });

      expect(clipboard.write).not.toHaveBeenCalled();
    });
  });

  // ── File mode ────────────────────────────────────────────────────────

  describe('file mode', () => {
    it('writes sanitized HTML to file at given path', async () => {
      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
            return Buffer.from(CHAPTER_HTML_FIXTURE, 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      const filePath = '/tmp/test-export.html';
      const result = await exportService.exportSubstack(
        'test-project',
        'test-chapter',
        undefined,
        'file',
        filePath,
      );

      expect(result).toEqual({ ok: true });
      expect(writeFileSync).toHaveBeenCalledTimes(1);
      expect(writeFileSync).toHaveBeenCalledWith(filePath, expect.any(String), 'utf-8');

      // Written content should be sanitized
      const writtenContent = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1]!;
      expect(writtenContent).toContain('<h2>');
      expect(writtenContent).toContain('<p>');
    });

    it('throws INVALID_PAYLOAD if no filePath provided', async () => {
      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
            return Buffer.from('<p>content</p>', 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await expect(
        exportService.exportSubstack('test-project', 'test-chapter', undefined, 'file', undefined),
      ).rejects.toEqual({
        code: 'INVALID_PAYLOAD',
        message: 'filePath required for file mode',
      });

      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  // ── Version resolution ───────────────────────────────────────────────

  describe('version resolution', () => {
    it('resolves selectedVersion from project manifest when no versionSlug provided', async () => {
      const { getOpenProject, mockReadBlob } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/chapter-with-version/draft' && filepath === 'chapter.html') {
            return Buffer.from('<p>Draft version content</p>', 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await exportService.exportSubstack(
        'test-project',
        'chapter-with-version',
        undefined,
        'clipboard',
      );

      // Should resolve 'draft' as the selectedVersion
      expect(mockReadBlob).toHaveBeenCalledWith(
        'refs/plotline/chapters/chapter-with-version/draft',
        'chapter.html',
      );
    });

    it('falls back to main if project.json cannot be read', async () => {
      const { getOpenProject, mockReadBlob } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            throw new Error('not found');
          }
          if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
            return Buffer.from('<p>Fallback content</p>', 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      // Should not throw since it falls back to 'main'
      const result = await exportService.exportSubstack(
        'test-project',
        'test-chapter',
        undefined,
        'clipboard',
      );

      expect(result).toEqual({ ok: true });
      expect(mockReadBlob).toHaveBeenCalledWith(
        'refs/plotline/chapters/test-chapter/main',
        'chapter.html',
      );
    });
  });

  // ── Sanitization golden test ─────────────────────────────────────────

  describe('sanitization', () => {
    it('exported HTML contains only allowlisted elements (disallowed elements stripped)', async () => {
      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
            return Buffer.from(DISALLOWED_ELEMENTS_FIXTURE, 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await exportService.exportSubstack(
        'test-project',
        'test-chapter',
        undefined,
        'clipboard',
      );

      const exportedHtml = (clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]!.html;

      // Allowed elements should survive
      expect(exportedHtml).toContain('<h2>');
      expect(exportedHtml).toContain('<p>');
      expect(exportedHtml).toContain('<strong>');
      expect(exportedHtml).toContain('<img');

      // Disallowed elements should be removed
      expect(exportedHtml).not.toContain('<script>');
      expect(exportedHtml).not.toContain('<div>');
      expect(exportedHtml).not.toContain('</div>');
      expect(exportedHtml).not.toContain('<iframe>');

      // Text content inside disallowed elements (wrapped in allowed) should survive
      expect(exportedHtml).toContain('Safe paragraph with');
      expect(exportedHtml).toContain('Inside div');

      // Bare text nodes directly under disallowed elements should be stripped
      expect(exportedHtml).not.toContain('Bare text in div');
    });
  });

  // ── Plaintext fallback ──────────────────────────────────────────────

  describe('plaintext fallback', () => {
    it('strips HTML tags in the clipboard text property', async () => {
      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
            return Buffer.from('<h2>Title</h2><p>Body text with <strong>bold</strong> and <em>italic</em>.</p>', 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await exportService.exportSubstack(
        'test-project',
        'test-chapter',
        undefined,
        'clipboard',
      );

      const clipboardData = (clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;

      // Plaintext should have no HTML tags
      expect(clipboardData.text).not.toContain('<h2>');
      expect(clipboardData.text).not.toContain('<p>');
      expect(clipboardData.text).not.toContain('<strong>');
      expect(clipboardData.text).not.toContain('</em>');

      // But should contain the text content
      expect(clipboardData.text).toContain('Title');
      expect(clipboardData.text).toContain('Body text with');
      expect(clipboardData.text).toContain('bold');
      expect(clipboardData.text).toContain('italic');
    });

    it('decodes common HTML entities in plaintext', async () => {
      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
            return Buffer.from('<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>', 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await exportService.exportSubstack(
        'test-project',
        'test-chapter',
        undefined,
        'clipboard',
      );

      const clipboardData = (clipboard.write as ReturnType<typeof vi.fn>).mock.calls[0]![0]!;

      expect(clipboardData.text).toContain('A & B');
      expect(clipboardData.text).toContain('C > D');
      expect(clipboardData.text).toContain('"E"');
      expect(clipboardData.text).toContain("'F'");
    });
  });

  // ── Markdown export (WP-24) ──────────────────────────────────────────

  describe('exportMarkdown', () => {
    // ── Chapter mode ─────────────────────────────────────────────────

    describe('chapter mode', () => {
      it('converts heading, paragraph, and list to markdown', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from('<h2>Chapter 1</h2><p>This is a paragraph.</p><ul><li>Item 1</li><li>Item 2</li></ul>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        const filePath = '/tmp/test-chapter.md';
        const result = await exportService.exportMarkdown('test-project', 'chapter', filePath, 'test-chapter');

        expect(result.path).toBe(filePath);
        expect(result.wordCount).toBeGreaterThan(0);

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        // Heading converted
        expect(written).toContain('## Chapter 1');
        // Paragraph converted
        expect(written).toContain('This is a paragraph.');
        // List items with bullets (turndown uses 3-space indent after marker)
        expect(written).toContain('-   Item 1');
        expect(written).toContain('-   Item 2');
        // Frontmatter present
        expect(written).toContain('---');
        expect(written).toContain('title: "The Beginning"');
        expect(written).toContain('version: "Main"');
        expect(written).toContain('slug: "main"');
        expect(written).toContain('date:');
      });

      it('converts figure/figcaption to markdown image with caption', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from('<figure><img src="x.png" alt="alt text"><figcaption>Nice image</figcaption></figure>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter');

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        expect(written).toContain('![alt text](x.png)');
        expect(written).toContain('*Nice image*');
      });

      it('converts strong, em, and strikethrough to markdown', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from('<p><strong>bold</strong> <em>italic</em> <s>strikethrough</s></p>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter');

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        expect(written).toContain('**bold**');
        expect(written).toContain('_italic_');
        expect(written).toContain('~~strikethrough~~');
      });

      it('converts links to markdown', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from('<p><a href="https://example.com">click here</a></p>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter');

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        expect(written).toContain('[click here](https://example.com)');
      });

      it('converts blockquote to markdown', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from('<blockquote><p>Quoted text</p></blockquote>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter');

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        expect(written).toContain('> Quoted text');
      });

      it('converts ordered list to markdown', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from('<ol><li>First</li><li>Second</li></ol>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter');

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        expect(written).toContain('1.  First');
        expect(written).toContain('2.  Second');
      });

      it('converts code block to fenced markdown', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from('<pre><code>const x = 1;</code></pre>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter');

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        expect(written).toContain('const x = 1;');
        // Should be fenced
        expect(written).toContain('```');
      });

      it('throws NO_ARTIFACT when chapter.html is missing', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            throw new Error('not found');
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await expect(
          exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter'),
        ).rejects.toEqual({
          code: 'NO_ARTIFACT',
          message: 'Chapter has no written artifact to export',
        });
      });

      it('throws NOT_FOUND when chapter ID is not in manifest', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            throw new Error('not found');
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await expect(
          exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'nonexistent-chapter'),
        ).rejects.toEqual({
          code: 'NOT_FOUND',
          message: 'Chapter nonexistent-chapter not found in project',
        });
      });
    });

    // ── Book mode ───────────────────────────────────────────────────

    describe('book mode', () => {
      const BOOK_MANIFEST = {
        ...MOCK_PROJECT_MANIFEST,
        title: 'Full Book',
        structure: [
          {
            kind: 'part' as const,
            id: 'part_001',
            title: 'Part One',
            chapters: [
              {
                id: 'ch-written-1',
                title: 'Chapter Alpha',
                selectedVersion: 'main',
                versions: [
                  { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
                ],
                wordTarget: null,
              },
              {
                id: 'ch-unwritten-1',
                title: 'Chapter Beta',
                selectedVersion: 'main',
                versions: [
                  { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
                ],
                wordTarget: null,
              },
            ],
          },
          {
            kind: 'part' as const,
            id: 'part_002',
            title: 'Part Two',
            chapters: [
              {
                id: 'ch-written-2',
                title: 'Chapter Gamma',
                selectedVersion: 'main',
                versions: [
                  { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
                ],
                wordTarget: null,
              },
              {
                id: 'ch-unwritten-2',
                title: 'Chapter Delta',
                selectedVersion: 'main',
                versions: [
                  { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
                ],
                wordTarget: null,
              },
            ],
          },
        ],
      };

      it('outputs full book with part headers and skips unwritten chapters', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(BOOK_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/ch-written-1/main' && filepath === 'chapter.html') {
              return Buffer.from('<h2>Alpha</h2><p>Content A.</p>', 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/ch-written-2/main' && filepath === 'chapter.html') {
              return Buffer.from('<h2>Gamma</h2><p>Content G.</p>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        const filePath = '/tmp/test-book.md';
        const result = await exportService.exportMarkdown('test-project', 'book', filePath);

        expect(result.path).toBe(filePath);

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        // Book title
        expect(written).toContain('# Full Book');
        // Part headers
        expect(written).toContain('## Part One');
        expect(written).toContain('## Part Two');
        // Written chapters
        expect(written).toContain('## Alpha');
        expect(written).toContain('## Gamma');
        // Unwritten chapters should be skipped
        expect(written).not.toContain('Chapter Beta');
        expect(written).not.toContain('Chapter Delta');
        // Frontmatter with part names
        expect(written).toContain('part: "Part One"');
        expect(written).toContain('part: "Part Two"');
        // Frontmatter titles match chapter titles
        expect(written).toContain('title: "Chapter Alpha"');
        expect(written).toContain('title: "Chapter Gamma"');
      });
    });

    // ── Allowlist golden test ────────────────────────────────────────

    describe('allowlist golden test', () => {
      it('strips disallowed elements in chapter mode output', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from(DISALLOWED_ELEMENTS_FIXTURE, 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter');

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;

        // Allowed content survives (as markdown)
        expect(written).toContain('## Clean Title');
        expect(written).toContain('Safe paragraph with');
        expect(written).toContain('**bold**');
        expect(written).toContain('Inside div');
        expect(written).toContain('![');
        expect(written).toContain('](https://example.com/img.png)');

        // Disallowed elements stripped
        expect(written).not.toContain('<script>');
        expect(written).not.toContain('<div>');
        expect(written).not.toContain('<iframe>');
        expect(written).not.toContain('Bare text in div');
      });
    });

    // ── Frontmatter content ─────────────────────────────────────────

    describe('frontmatter content', () => {
      it('contains title, part, version, slug, and date fields', async () => {
        const { getOpenProject } = createMockProjectService(
          (ref: string, filepath: string) => {
            if (ref === 'refs/heads/main' && filepath === 'project.json') {
              return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
            }
            if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
              return Buffer.from('<p>Some content</p>', 'utf-8');
            }
            throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
          },
        );

        const mockProjectService = { getOpenProject } as any;
        exportService = new ExportService(mockProjectService);

        await exportService.exportMarkdown('test-project', 'chapter', '/tmp/test.md', 'test-chapter');

        const written = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
        const frontmatterMatch = written.match(/^---\n([\s\S]*?)\n---/);
        expect(frontmatterMatch).not.toBeNull();

        const fm = frontmatterMatch![1]!;
        expect(fm).toContain('title: "The Beginning"');
        expect(fm).toContain('part: "Part One"');
        expect(fm).toContain('version: "Main"');
        expect(fm).toContain('slug: "main"');
        expect(fm).toContain('date:');
      });
    });
  });

  // ── PDF export (WP-25) ──────────────────────────────────────────────

  describe('exportPdf', () => {
    it('listLatexTemplates returns built-in templates', async () => {
      const { getOpenProject } = createMockProjectService(
        () => { throw new Error('should not be called'); },
      );
      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      const result = await exportService.listLatexTemplates();

      expect(result).toHaveLength(3);
      expect(result[0]!.id).toBe('trade-paperback');
      expect(result[1]!.id).toBe('manuscript-submission');
      expect(result[2]!.id).toBe('a4-article');
      expect(result[0]!.name).toBe('Trade Paperback');
    });

    it('exportPdf builds LaTeX content and calls TectonicRunner', async () => {
      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/test-chapter/main' && filepath === 'chapter.html') {
            return Buffer.from('<h2>Chapter 1</h2><p>Hello world</p>', 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/chapter-with-version/draft' && filepath === 'chapter.html') {
            return Buffer.from('<p>Draft content</p>', 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      // Mock readFileSync for template loading
      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('\\documentclass{article}\n%%TITLE%%\n%%BODY%%');

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      const onProgress = vi.fn();
      const result = await exportService.exportPdf(
        'test-project',
        'trade-paperback',
        ['test-chapter'],
        {},
        '/tmp/output.pdf',
        onProgress,
      );

      expect(result.pdfPath).toBe('/tmp/output.pdf');

      // Templates should be loaded
      expect(readFileSync).toHaveBeenCalled();

      // Should have written a .tex file
      expect(writeFileSync).toHaveBeenCalled();

      // Should have copied the PDF to output path
      expect(copyFileSync).toHaveBeenCalledWith(
        expect.stringContaining('export.pdf'),
        '/tmp/output.pdf',
      );

      // Progress was emitted
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith('[plotline] LaTeX document generated');
    });

    it('exportPdf with "all" chapters collects from structure', async () => {
      const CHAPTERS_MANIFEST = {
        ...MOCK_PROJECT_MANIFEST,
        structure: [
          {
            kind: 'part',
            id: 'part_001',
            title: 'Part One',
            chapters: [
              { id: 'ch-1', title: 'Chapter Alpha', selectedVersion: 'main', versions: [
                { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
              ], wordTarget: null },
              { id: 'ch-2', title: 'Chapter Beta', selectedVersion: 'main', versions: [
                { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
              ], wordTarget: null },
            ],
          },
        ],
      };

      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(CHAPTERS_MANIFEST), 'utf-8');
          }
          if (ref.startsWith('refs/plotline/chapters/') && filepath === 'chapter.html') {
            return Buffer.from('<p>Content</p>', 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('\\documentclass{article}\n%%TITLE%%\n%%BODY%%');

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      const onProgress = vi.fn();
      const result = await exportService.exportPdf(
        'test-project',
        'trade-paperback',
        'all',
        {},
        '/tmp/output.pdf',
        onProgress,
      );

      expect(result.pdfPath).toBe('/tmp/output.pdf');
      expect(onProgress).toHaveBeenCalled();
      expect(copyFileSync).toHaveBeenCalled();
    });

    it('exportPdf skips unwritten chapters', async () => {
      const CHAPTERS_MANIFEST = {
        ...MOCK_PROJECT_MANIFEST,
        structure: [
          {
            kind: 'part',
            id: 'part_001',
            title: 'Part One',
            chapters: [
              { id: 'ch-written', title: 'Written Ch', selectedVersion: 'main', versions: [
                { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
              ], wordTarget: null },
              { id: 'ch-unwritten', title: 'Unwritten Ch', selectedVersion: 'main', versions: [
                { slug: 'main', name: 'Main', createdAt: '2026-01-01T00:00:00.000Z', createdFrom: null, archived: false },
              ], wordTarget: null },
            ],
          },
        ],
      };

      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(CHAPTERS_MANIFEST), 'utf-8');
          }
          if (ref === 'refs/plotline/chapters/ch-written/main' && filepath === 'chapter.html') {
            return Buffer.from('<p>Written content</p>', 'utf-8');
          }
          // ch-unwritten throws (no artifact)
          throw new Error('not found');
        },
      );

      (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('\\documentclass{article}\n%%BODY%%');

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      const onProgress = vi.fn();
      const result = await exportService.exportPdf(
        'test-project',
        'trade-paperback',
        'all',
        {},
        '/tmp/output.pdf',
        onProgress,
      );

      expect(result.pdfPath).toBe('/tmp/output.pdf');

      // Should have reported skipping the unwritten chapter
      expect(onProgress).toHaveBeenCalledWith('[plotline] Skipping unwritten chapter: Unwritten Ch');
    });

    it('exportPdf throws NO_CHAPTERS if no chapters match', async () => {
      const { getOpenProject, mockReadBlob } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          throw new Error(`Unexpected readBlob(${ref}, ${filepath})`);
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await expect(
        exportService.exportPdf(
          'test-project',
          'trade-paperback',
          ['nonexistent-chapter'],
          {},
          '/tmp/output.pdf',
          vi.fn(),
        ),
      ).rejects.toEqual({
        code: 'NO_CHAPTERS',
        message: 'No chapters to export',
      });
    });

    it('exportPdf throws NO_ARTIFACT if no chapters have written content', async () => {
      const { getOpenProject } = createMockProjectService(
        (ref: string, filepath: string) => {
          if (ref === 'refs/heads/main' && filepath === 'project.json') {
            return Buffer.from(JSON.stringify(MOCK_PROJECT_MANIFEST), 'utf-8');
          }
          throw new Error('not found');
        },
      );

      const mockProjectService = { getOpenProject } as any;
      exportService = new ExportService(mockProjectService);

      await expect(
        exportService.exportPdf(
          'test-project',
          'trade-paperback',
          ['test-chapter'],
          {},
          '/tmp/output.pdf',
          vi.fn(),
        ),
      ).rejects.toEqual({
        code: 'NO_ARTIFACT',
        message: 'No chapters have written artifacts to export',
      });
    });
  });
});

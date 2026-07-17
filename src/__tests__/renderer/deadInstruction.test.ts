/**
 * Dead-instruction audit — WP-34 AC.
 *
 * Walks every renderer component's empty state and user-facing text
 * for the word "import" and asserts a functional button/element is
 * adjacent. Prevents the v0.1.0 defect where "or import an outline
 * to get started" appeared with no clickable control.
 *
 * Excludes ImportDialog.tsx (it IS the import control itself, not a
 * consumer), import statements, BEM class names, and IPC call sites.
 *
 * Version: 0.2.0 | 2026-07-17
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Read all .tsx files under a directory recursively. */
function readTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readTsxFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Extract user-visible text lines that contain the word "import" (case-insensitive),
 * excluding import statements, BEM class names, and IPC call sites.
 */
function findImportMentions(content: string, filePath: string): string[] {
  const lines = content.split('\n');
  const results: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // Skip TypeScript import statements
    if (/^\s*import\b/.test(line)) continue;
    // Skip comment lines
    if (/^\s*\/\/|\/\*\*?|\*/.test(line.trim())) continue;
    // Skip lines where "import" only appears in a className= attribute (BEM)
    if (/\bimport\b/i.test(line)) {
      // Check: does the line have "import" outside of className?
      if (/className="[^"]*import-dialog[^"]*"/i.test(line)) continue;
      // Skip IPC call sites (these are functional, not user-facing)
      if (/invoke\(.*importOutline|invoke\(.*confirmImport|invoke\(.*pickAndImport/i.test(line)) continue;
      // Skip form field labels with descriptive text (e.g. label="Parse (outline import)")
      if (/\blabel="[^"]*import[^"]*"/i.test(line)) continue;

      results.push(`${filePath}:${lineNum}`);
    }
  }

  return results;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Dead-instruction audit (WP-34)', () => {
  const componentsDir = path.resolve(__dirname, '../../renderer/components');

  // Collect all files except ImportDialog.tsx (it's the import control itself)
  const tsxFiles = readTsxFiles(componentsDir).filter(
    (f) => !f.endsWith('ImportDialog.tsx'),
  );

  it('every "import" mention in user-facing text has an adjacent button or clickable control', () => {
    const failures: string[] = [];

    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        // Skip TypeScript import statements
        if (/^\s*import\b/.test(line)) continue;
        // Skip comment lines
        if (/^\s*\/\/|\/\*\*?|\*/.test(line.trim())) continue;
        // Skip lines where "import" only appears inside className= BEM patterns
        if (/\bimport\b/i.test(line)) {
          // Check if "import" appears only in a className attribute
          const withoutClassName = line.replace(/className="[^"]*"/g, '');
          const withoutInvoke = withoutClassName.replace(/invoke\([^)]*import[^)]*\)/gi, '');
          // Skip form field labels with descriptive text (e.g. label="Parse (outline import)")
          const withoutLabels = withoutInvoke.replace(/\blabel="[^"]*import[^"]*"/gi, '');
          if (!/\bimport\b/i.test(withoutLabels)) continue;

          // Check context window (3 lines before/after) for a button or control
          const start = Math.max(0, i - 3);
          const end = Math.min(lines.length, i + 4);
          const window = lines.slice(start, end).join('\n');

          const hasButton = /<button\b|onClick\s*[=:{]|role="button"/i.test(window);
          const hasImportCallback = /ImportDialog|openImport|setImport|importOutline|pickAndImportOutline|handleImport|showImport/i.test(window);

          if (!hasButton && !hasImportCallback) {
            failures.push(
              `${file}:${lineNum} — "import" mention without adjacent button/control:\n  ${line.trim().slice(0, 120)}`,
            );
          }
        }
      }
    }

    if (failures.length > 0) {
      expect.fail(
        `Dead instructions found (${failures.length}):\n\n${failures.join('\n\n')}\n\n` +
          'Every user-facing "import" text must have an adjacent button, onClick handler, or clickable control.',
      );
    }

    // If we get here with zero failures, the test passes
    expect(failures.length).toBe(0);
  });

  it('ChapterWorkspace empty state has an import button', () => {
    const chapterFile = path.join(componentsDir, 'ChapterWorkspace.tsx');
    const content = fs.readFileSync(chapterFile, 'utf-8');

    // Match the full outline stage empty state block (div with chapter-workspace__empty class and its content)
    const emptySection = content.match(
      /chapter-workspace__empty[\s\S]{0,500}/,
    );

    expect(emptySection).not.toBeNull();

    if (emptySection) {
      const hasImportText = /import/i.test(emptySection[0]);
      const hasButton = /<button\b|onClick|importOutline/i.test(emptySection[0]);

      expect(hasImportText).toBe(true);
      expect(hasButton).toBe(true);
    }
  });

  it('Workspace empty state has an import button', () => {
    const workspaceFile = path.join(componentsDir, 'Workspace.tsx');
    const content = fs.readFileSync(workspaceFile, 'utf-8');

    // The "none" selection empty state should have an import button
    const hasButton = /workspace-empty[\s\S]*?onImportOutline|<button[\s\S]*?Import Outline/im.test(content);
    expect(hasButton).toBe(true);
  });

  it('ManuscriptTree empty state has an import button', () => {
    const treeFile = path.join(componentsDir, 'ManuscriptTree.tsx');
    const content = fs.readFileSync(treeFile, 'utf-8');

    const hasButton = /tree-empty[\s\S]*?onImportOutline|<button[\s\S]*?Import Outline/im.test(content);
    // Only fails if there are no parts (demo always has parts, but the source must have the button)
    expect(hasButton).toBe(true);
  });

  it('OutlineWorkspace empty state has an import button', () => {
    const outlineFile = path.join(componentsDir, 'OutlineWorkspace.tsx');
    const content = fs.readFileSync(outlineFile, 'utf-8');

    const hasButton = /outline-empty[\s\S]*?onImportOutline|<button[\s\S]*?Import Outline/im.test(content);
    expect(hasButton).toBe(true);
  });
});

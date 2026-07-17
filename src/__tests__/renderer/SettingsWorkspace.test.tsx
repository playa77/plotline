/**
 * SettingsWorkspace component tests (WP-27).
 *
 * Tests the settings pane rendering, section expand/collapse, and
 * interactions for all 7 settings sections. All IPC calls are mocked.
 *
 * @vitest-environment jsdom
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SettingsWorkspace } from '../../renderer/components/SettingsWorkspace';
import type { Project } from '../../shared/schemas/project';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockProject(overrides?: Partial<Project>): Project {
  return {
    schemaVersion: 2,
    projectId: 'test-project-123',
    title: 'Test Project',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    settings: {
      continuityContext: { enabled: true, words: 500 },
      styleGuidance: 'per-chapter' as const,
      models: {
        expand: { provider: 'openrouter', model: 'model-a' },
        write: { provider: 'openrouter', model: 'model-b' },
        iterate: { provider: 'openrouter', model: 'model-c' },
        parse: { provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' },
      },
      inference: { baseUrl: 'https://openrouter.ai/api/v1' },
      theme: 'dark',
      editor: { fontMode: 'serif' },
      typography: { uiScale: 100, editorFontSize: 18 },
      backupRemote: null,
    },
    structure: [],
    ...overrides,
  };
}

/**
 * Simulate a user typing a value into an input element.
 * React 18's onChange listens for the native `input` event, so we must
 * set the value via the native property descriptor and dispatch `input`.
 */
function simulateInput(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SettingsWorkspace', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  // ── Helper: render with mock invoke ───────────────────────────────

  /**
   * Sets up the window.plotline.mock and renders the component.
   * The component defaults to projectId="demo".
   */
  function renderWithMocks(options?: {
    hasKey?: boolean;
    projectOverrides?: Partial<Project>;
  }) {
    const project = createMockProject(options?.projectOverrides);

    const invokeMock = vi.fn().mockImplementation(
      async (cmd: string, _payload: unknown) => {
        switch (cmd) {
          case 'project:open':
            return { data: project };
          case 'secrets:hasApiKey':
            return { data: { hasKey: options?.hasKey ?? false } };
          case 'project:updateSettings':
            return { data: project };
          case 'secrets:setApiKey':
            return { data: { ok: true } };
          case 'secrets:deleteApiKey':
            return { data: { ok: true } };
          default:
            return { data: {} };
        }
      },
    );

    (window as any).plotline = {
      invoke: invokeMock,
      on: vi.fn(),
      off: vi.fn(),
    };

    return { project, invokeMock };
  }

  // ── Renders all 7 section headers ─────────────────────────────────

  it('renders all 7 collapsible section headers', async () => {
    renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    // Flush async effects (project:open, secrets:hasApiKey)
    await act(async () => {});

    const text = container.textContent ?? '';

    // The eight section titles rendered as header buttons
    expect(text).toContain('API Key');
    expect(text).toContain('Models');
    expect(text).toContain('Inference');
    expect(text).toContain('Continuity Context');
    expect(text).toContain('Writing Style');
    expect(text).toContain('Theme');
    expect(text).toContain('Editor');
    expect(text).toContain('Backup Remote');
  });

  // ── Section expand / collapse ─────────────────────────────────────

  it('clicking a section header expands/collapses it', async () => {
    renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    // All sections start open by default
    const bodiesBefore = container.querySelectorAll('.settings-section__body');
    expect(bodiesBefore.length).toBeGreaterThan(0);

    // Find and click the first section header
    const header = container.querySelector('.settings-section__header');
    expect(header).not.toBeNull();

    await act(async () => {
      (header as HTMLButtonElement).click();
    });

    // The body should now be hidden (fewer .settings-section__body elements)
    const bodiesAfter = container.querySelectorAll('.settings-section__body');
    expect(bodiesAfter.length).toBe(bodiesBefore.length - 1);
  });

  // ── Loading state ─────────────────────────────────────────────────

  it('shows loading state before project data is fetched', async () => {
    // Don't resolve the invoke promise — render and check the loading
    // state synchronously before effects complete
    (window as any).plotline = {
      invoke: vi.fn().mockImplementation(
        () => new Promise(() => {}), // Never resolves
      ),
      on: vi.fn(),
      off: vi.fn(),
    };

    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });

    expect(container.textContent).toContain('Loading settings…');
  });

  // ── API Key section (no key) ──────────────────────────────────────

  it('shows Set API Key when no key is configured', async () => {
    renderWithMocks({ hasKey: false });
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    expect(container.textContent).toContain('No API key configured');
    expect(container.textContent).toContain('Set API Key');
  });

  // ── API Key section (key exists) ──────────────────────────────────

  it('shows Remove button when a key is configured', async () => {
    renderWithMocks({ hasKey: true });
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    expect(container.textContent).toContain('API key is configured');
    expect(container.textContent).toContain('Remove');
    expect(container.textContent).toContain('Change');
  });

  // ── Theme radio buttons ───────────────────────────────────────────

  it('Theme dark/light radio selection calls updateSettings', async () => {
    const { invokeMock } = renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    // Find the light radio input
    const lightRadio = container.querySelector<HTMLInputElement>(
      'input[type="radio"][value="light"]',
    );
    expect(lightRadio).not.toBeNull();

    await act(async () => {
      lightRadio!.click();
    });

    // The component defaults to projectId="demo"
    expect(invokeMock).toHaveBeenCalledWith('project:updateSettings', {
      projectId: 'demo',
      settings: { theme: 'light' },
    });
  });

  // ── Editor radio buttons ──────────────────────────────────────────

  it('Editor serif/mono radio selection calls updateSettings', async () => {
    const { invokeMock } = renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    const monoRadio = container.querySelector<HTMLInputElement>(
      'input[type="radio"][value="mono"]',
    );
    expect(monoRadio).not.toBeNull();

    await act(async () => {
      monoRadio!.click();
    });

    expect(invokeMock).toHaveBeenCalledWith('project:updateSettings', {
      projectId: 'demo',
      settings: { editor: { fontMode: 'mono' } },
    });
  });

  // ── Continuity Context toggle ─────────────────────────────────────

  it('ToggleField toggles continuity context enabled on/off', async () => {
    const { invokeMock } = renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    // Find the toggle checkbox
    const toggle = container.querySelector<HTMLInputElement>(
      '.settings-toggle__input',
    );
    expect(toggle).not.toBeNull();
    expect(toggle!.checked).toBe(true); // default is enabled

    // Toggle it
    await act(async () => {
      toggle!.click();
    });

    expect(invokeMock).toHaveBeenCalledWith('project:updateSettings', {
      projectId: 'demo',
      settings: { continuityContext: { enabled: false, words: 500 } },
    });
  });

  // ── NumberField: word budget ──────────────────────────────────────

  it('NumberField saves a new word budget value', async () => {
    const { invokeMock } = renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    // Find the "Change" button inside the Continuity Context section
    // (the word budget field only shows when continuity context is enabled)
    const sections = container.querySelectorAll('.settings-section');
    let budgetSection: Element | null = null;
    for (const section of sections) {
      if (section.textContent?.includes('Word budget')) {
        budgetSection = section;
        break;
      }
    }
    expect(budgetSection).not.toBeNull();

    const changeBtn = budgetSection!.querySelector<HTMLButtonElement>(
      '.settings-btn--secondary',
    );
    expect(changeBtn).not.toBeNull();

    await act(async () => {
      changeBtn!.click();
    });

    // Type a new value into the number input
    const numberInput = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    );
    expect(numberInput).not.toBeNull();

    await act(async () => {
      simulateInput(numberInput!, '750');
    });

    // Click the "Save" button inside the word budget section
    const saveBtn = budgetSection!.querySelector<HTMLButtonElement>(
      '.settings-btn--primary',
    );
    expect(saveBtn).not.toBeNull();

    await act(async () => {
      saveBtn!.click();
    });

    expect(invokeMock).toHaveBeenCalledWith('project:updateSettings', {
      projectId: 'demo',
      settings: { continuityContext: { enabled: true, words: 750 } },
    });
  });

  // ── ModelField ────────────────────────────────────────────────────

  it('ModelField shows provider/model and Change button', async () => {
    renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    // Model section should show the current model values
    const text = container.textContent ?? '';
    expect(text).toContain('openrouter/model-a');
    expect(text).toContain('openrouter/model-b');
    expect(text).toContain('openrouter/model-c');

    // Each model has a Change button
    const changeLabels = container.querySelectorAll('.settings-btn--secondary');
    expect(changeLabels.length).toBeGreaterThanOrEqual(3);
  });

  // ── TextField: base URL ───────────────────────────────────────────

  it('TextField allows typing an inference base URL', async () => {
    const { invokeMock } = renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    // Find the Change button in the Inference section (Base URL field)
    const fields = container.querySelectorAll('.settings-field');
    let inferenceField: Element | null = null;
    for (const field of fields) {
      if (field.textContent?.includes('Base URL')) {
        inferenceField = field;
        break;
      }
    }
    expect(inferenceField).not.toBeNull();

    const changeBtn = inferenceField!.querySelector<HTMLButtonElement>(
      '.settings-btn--secondary',
    );
    expect(changeBtn).not.toBeNull();

    await act(async () => {
      changeBtn!.click();
    });

    // Type a new URL
    const textInput = container.querySelector<HTMLInputElement>(
      'input[type="text"]',
    );
    expect(textInput).not.toBeNull();

    await act(async () => {
      simulateInput(textInput!, 'https://custom.api/v2');
    });

    // Click Save
    const saveBtn = inferenceField!.querySelector<HTMLButtonElement>(
      '.settings-btn--primary',
    );
    expect(saveBtn).not.toBeNull();

    await act(async () => {
      saveBtn!.click();
    });

    expect(invokeMock).toHaveBeenCalledWith('project:updateSettings', {
      projectId: 'demo',
      settings: { inference: { baseUrl: 'https://custom.api/v2' } },
    });
  });

  // ── All sections start open (Section defaultOpen = true) ──────────

  it('all sections start open by default', async () => {
    renderWithMocks();
    await act(async () => {
      root = createRoot(container);
      root.render(<SettingsWorkspace />);
    });
    await act(async () => {});

    // Every Section component uses defaultOpen={true}
    const bodies = container.querySelectorAll('.settings-section__body');
    expect(bodies.length).toBe(9); // 9 sections, all open
  });
});

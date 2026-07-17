/**
 * Tests for the CommandPalette component (WP-26).
 *
 * Covers: rendering, search filtering, keyboard navigation, mouse interaction,
 * grouping, shortcut display, and edge cases.
 *
 * @vitest-environment jsdom
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { CommandPalette } from '../../renderer/components/CommandPalette';
import type { CommandAction } from '../../renderer/actions';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAction(overrides: Partial<CommandAction> = {}): CommandAction {
  return {
    id: 'test:action',
    label: 'Test Action',
    category: 'generation',
    available: () => true,
    execute: vi.fn(),
    ...overrides,
  };
}

const defaultActions: CommandAction[] = [
  makeAction({
    id: 'gen:expand',
    label: 'Expand',
    category: 'generation',
    shortcut: 'Cmd+Shift+E',
    keywords: ['generate', 'ai'],
  }),
  makeAction({
    id: 'nav:outline',
    label: 'Go to Outline',
    category: 'navigation',
    keywords: ['workspace'],
  }),
  makeAction({
    id: 'editor:bold',
    label: 'Bold',
    category: 'editor',
    keywords: ['strong'],
  }),
  makeAction({
    id: 'editor:italic',
    label: 'Italic',
    category: 'editor',
    keywords: ['emphasis'],
  }),
];

// ── Helpers ──────────────────────────────────────────────────────────────────

interface RenderResult {
  root: Root;
  container: HTMLElement;
  onClose: () => void;
  actions: CommandAction[];
  unmount: () => void;
}

function renderPalette(props: {
  open?: boolean;
  actions?: CommandAction[];
  onClose?: () => void;
} = {}): RenderResult {
  const onClose = props.onClose ?? vi.fn();
  const actions = props.actions ?? defaultActions;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <CommandPalette
        open={props.open ?? true}
        actions={actions}
        onClose={onClose}
      />,
    );
  });

  return {
    root,
    container,
    onClose,
    actions,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    },
  };
}

/**
 * Set the value of a controlled React input and dispatch the 'input' event.
 * Uses the native value setter to work with React 18's controlled input model.
 */
function typeInInput(input: HTMLInputElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function keyDown(element: HTMLElement, key: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

function click(element: HTMLElement): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function mouseEnter(element: HTMLElement): void {
  act(() => {
    // React's onMouseEnter is backed by the native mouseover event
    // (mouseenter doesn't bubble, so React delegates via mouseover)
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
}

/** Dispatch a click on the backdrop (directly, not on a child). */
function clickBackdrop(backdrop: HTMLElement): void {
  act(() => {
    backdrop.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
}

/** Query the portal content rendered in document.body. */
function queryPortal(selector: string): HTMLElement | null {
  return document.body.querySelector(selector);
}

function queryPortalAll(selector: string): NodeListOf<HTMLElement> {
  return document.body.querySelectorAll(selector);
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CommandPalette', () => {
  // ── Visibility ───────────────────────────────────────────────────────────

  it('renders when open=true', () => {
    const { unmount } = renderPalette({ open: true });
    const backdrop = queryPortal('.command-palette__backdrop');
    expect(backdrop).not.toBeNull();
    unmount();
  });

  it('does not render when open=false', () => {
    const { unmount } = renderPalette({ open: false });
    const backdrop = queryPortal('.command-palette__backdrop');
    expect(backdrop).toBeNull();
    unmount();
  });

  // ── Search input ─────────────────────────────────────────────────────────

  it('renders search input', () => {
    const { unmount } = renderPalette({ open: true });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;
    expect(input).not.toBeNull();
    // Note: auto-focus uses requestAnimationFrame which is async in jsdom
    // and not flushed by act(). Focus behavior is verified in browser tests.
    unmount();
  });

  it('renders with placeholder "Type a command…"', () => {
    const { unmount } = renderPalette({ open: true });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;
    expect(input?.placeholder).toBe('Type a command…');
    unmount();
  });

  // ── Close on Escape ──────────────────────────────────────────────────────

  it('calls onClose when Escape is pressed on the input', () => {
    const { unmount, onClose } = renderPalette({ open: true });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;
    keyDown(input, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  // ── Close on backdrop click ──────────────────────────────────────────────

  it('calls onClose when backdrop is clicked', () => {
    const { unmount, onClose } = renderPalette({ open: true });
    const backdrop = queryPortal('.command-palette__backdrop') as HTMLElement;
    clickBackdrop(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not call onClose when clicking inside the palette panel', () => {
    const { unmount, onClose } = renderPalette({ open: true });
    const palette = queryPortal('.command-palette') as HTMLElement;
    click(palette);
    expect(onClose).not.toHaveBeenCalled();
    unmount();
  });

  // ── Filtering ────────────────────────────────────────────────────────────

  it('shows all actions when search is empty', () => {
    const { unmount } = renderPalette({ open: true, actions: defaultActions });
    const items = queryPortalAll('.command-palette__item');
    // All 4 default actions should be rendered
    expect(items.length).toBe(defaultActions.length);
    unmount();
  });

  it('filters actions when user types in search', () => {
    const { unmount } = renderPalette({ open: true, actions: defaultActions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    act(() => {
      typeInInput(input, 'Expand');
    });

    const items = queryPortalAll('.command-palette__item');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Expand');
    unmount();
  });

  it('matches actions by keyword (not just label)', () => {
    const { unmount } = renderPalette({ open: true, actions: defaultActions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    act(() => {
      typeInInput(input, 'workspace');
    });

    const items = queryPortalAll('.command-palette__item');
    expect(items.length).toBe(1);
    expect(items[0]?.textContent).toContain('Go to Outline');
    unmount();
  });

  it('shows "No matching commands" when query matches nothing', () => {
    const { unmount } = renderPalette({ open: true, actions: defaultActions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    act(() => {
      typeInInput(input, 'xyznonexistent');
    });

    const emptyMsg = queryPortal('.command-palette__empty');
    expect(emptyMsg).not.toBeNull();
    expect(emptyMsg?.textContent).toContain('No matching commands');

    // No action items should be present
    const items = queryPortalAll('.command-palette__item');
    expect(items.length).toBe(0);
    unmount();
  });

  // ── Keyboard navigation ──────────────────────────────────────────────────

  it('ArrowDown moves selection forward and wraps to last item', () => {
    const { unmount } = renderPalette({ open: true, actions: defaultActions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    // Initially first item is selected
    let selected = queryPortalAll('.command-palette__item--selected');
    expect(selected.length).toBe(1);

    // ArrowDown to second item
    keyDown(input, 'ArrowDown');
    selected = queryPortalAll('.command-palette__item--selected');
    expect(selected.length).toBe(1);

    // ArrowDown repeatedly to end
    for (let i = 1; i < defaultActions.length; i++) {
      keyDown(input, 'ArrowDown');
    }
    // Last item should be selected
    const lastItem = queryPortalAll('.command-palette__item')[defaultActions.length - 1] as HTMLElement;
    expect(lastItem.classList.contains('command-palette__item--selected')).toBe(true);

    unmount();
  });

  it('ArrowUp moves selection backward', () => {
    const { unmount } = renderPalette({ open: true, actions: defaultActions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    // Move down twice first
    keyDown(input, 'ArrowDown');
    keyDown(input, 'ArrowDown');

    // Then up once
    keyDown(input, 'ArrowUp');

    // Second item should be selected (index 1)
    const items = queryPortalAll('.command-palette__item');
    expect(items[1]?.classList.contains('command-palette__item--selected')).toBe(true);
    unmount();
  });

  it('Enter executes the selected action and calls onClose', () => {
    const execute = vi.fn();
    const actions = [
      makeAction({ id: 'act-1', label: 'First', category: 'generation', execute }),
      makeAction({ id: 'act-2', label: 'Second', category: 'navigation', execute: vi.fn() }),
    ];
    const { unmount, onClose } = renderPalette({ open: true, actions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    // First action is selected by default
    keyDown(input, 'Enter');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('Enter on second (ArrowDown-selected) item executes that action', () => {
    const executeSecond = vi.fn();
    const actions = [
      makeAction({ id: 'act-1', label: 'First', category: 'generation', execute: vi.fn() }),
      makeAction({ id: 'act-2', label: 'Second', category: 'navigation', execute: executeSecond }),
    ];
    const { unmount, onClose } = renderPalette({ open: true, actions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    keyDown(input, 'ArrowDown');
    keyDown(input, 'Enter');

    expect(executeSecond).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('Home jumps to first item', () => {
    const { unmount } = renderPalette({ open: true, actions: defaultActions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    // Move down a few times
    keyDown(input, 'ArrowDown');
    keyDown(input, 'ArrowDown');
    keyDown(input, 'ArrowDown');

    // Then Home
    keyDown(input, 'Home');

    const items = queryPortalAll('.command-palette__item');
    expect(items[0]?.classList.contains('command-palette__item--selected')).toBe(true);
    unmount();
  });

  it('End jumps to last item', () => {
    const { unmount } = renderPalette({ open: true, actions: defaultActions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    keyDown(input, 'End');

    const items = queryPortalAll('.command-palette__item');
    expect(items[items.length - 1]?.classList.contains('command-palette__item--selected')).toBe(true);
    unmount();
  });

  // ── Grouping ─────────────────────────────────────────────────────────────

  it('groups actions by category with labels', () => {
    const actions = [
      makeAction({ id: 'a1', label: 'Expand', category: 'generation' }),
      makeAction({ id: 'a2', label: 'Bold', category: 'editor' }),
      makeAction({ id: 'a3', label: 'Go to Outline', category: 'navigation' }),
    ];
    const { unmount } = renderPalette({ open: true, actions });

    const groupLabels = queryPortalAll('.command-palette__group-label');
    const labelTexts = Array.from(groupLabels).map((el) => el.textContent);

    expect(labelTexts).toContain('Generation');
    expect(labelTexts).toContain('Editor');
    expect(labelTexts).toContain('Navigation');
    unmount();
  });

  it('displays actions in the correct category group', () => {
    const actions = [
      makeAction({ id: 'a1', label: 'Expand', category: 'generation' }),
      makeAction({ id: 'a2', label: 'Bold', category: 'editor' }),
    ];
    const { unmount } = renderPalette({ open: true, actions });

    // The generation group should contain "Expand"
    const groups = queryPortalAll('.command-palette__group');
    for (const group of groups) {
      const label = group.querySelector('.command-palette__group-label')?.textContent;
      const itemLabels = Array.from(group.querySelectorAll('.command-palette__item-label')).map(
        (el) => el.textContent,
      );
      if (label === 'Generation') {
        expect(itemLabels).toContain('Expand');
        expect(itemLabels).not.toContain('Bold');
      } else if (label === 'Editor') {
        expect(itemLabels).toContain('Bold');
      }
    }
    unmount();
  });

  // ── Shortcut display ─────────────────────────────────────────────────────

  it('shows shortcut hint in action items that have shortcuts', () => {
    const actions = [
      makeAction({ id: 'a1', label: 'Expand', category: 'generation', shortcut: 'Cmd+Shift+E' }),
      makeAction({ id: 'a2', label: 'Bold', category: 'editor' }), // no shortcut
    ];
    const { unmount } = renderPalette({ open: true, actions });

    const shortcuts = queryPortalAll('.command-palette__item-shortcut');
    expect(shortcuts.length).toBe(1);
    expect(shortcuts[0]?.textContent).toContain('Cmd+Shift+E');
    unmount();
  });

  it('renders footer hint with navigation instructions', () => {
    const { unmount } = renderPalette({ open: true });
    const footer = queryPortal('.command-palette__footer');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toMatch(/navigate|execute|dismiss/i);
    unmount();
  });

  // ── Mouse interaction ────────────────────────────────────────────────────

  it('mouse hover updates selected index', () => {
    const actions = [
      makeAction({ id: 'a1', label: 'First', category: 'generation' }),
      makeAction({ id: 'a2', label: 'Second', category: 'navigation' }),
    ];
    const { unmount } = renderPalette({ open: true, actions });

    const items = queryPortalAll('.command-palette__item');
    expect(items.length).toBeGreaterThanOrEqual(2);

    // Initially first is selected
    expect(items[0]?.classList.contains('command-palette__item--selected')).toBe(true);

    // Hover over the second item
    act(() => {
      mouseEnter(items[1] as HTMLElement);
    });

    expect(items[1]?.classList.contains('command-palette__item--selected')).toBe(true);
    expect(items[0]?.classList.contains('command-palette__item--selected')).toBe(false);
    unmount();
  });

  // ── Selected state styling ───────────────────────────────────────────────

  it('selected item has command-palette__item--selected class', () => {
    const actions = [
      makeAction({ id: 'a1', label: 'First', category: 'generation' }),
      makeAction({ id: 'a2', label: 'Second', category: 'navigation' }),
    ];
    const { unmount } = renderPalette({ open: true, actions });

    // Move down to second
    const input = queryPortal('.command-palette__input') as HTMLInputElement;
    keyDown(input, 'ArrowDown');

    const items = queryPortalAll('.command-palette__item');
    expect(items[1]?.classList.contains('command-palette__item--selected')).toBe(true);
    unmount();
  });

  // ── Click-to-execute ─────────────────────────────────────────────────────

  it('clicking an action executes it and closes the palette', () => {
    const execute = vi.fn();
    const actions = [
      makeAction({ id: 'a1', label: 'Clickable', category: 'generation', execute }),
    ];
    const { unmount, onClose } = renderPalette({ open: true, actions });

    const item = queryPortal('.command-palette__item') as HTMLElement;
    act(() => {
      click(item);
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('actions without label are skipped gracefully (no crash)', () => {
    const actions = [
      makeAction({ id: 'a1', label: 'Normal', category: 'generation' }),
      // An action with an empty label — should not crash
      makeAction({ id: 'a2', label: '', category: 'navigation' }),
    ];
    const { unmount } = renderPalette({ open: true, actions });

    // Both items should render (the empty-label one will have no visible text)
    const items = queryPortalAll('.command-palette__item');
    expect(items.length).toBe(2);
    unmount();
  });

  it('resets query and selection when palette reopens', () => {
    const { unmount: unmount1, onClose } = renderPalette({ open: true });
    const input1 = queryPortal('.command-palette__input') as HTMLInputElement;

    // Type something and move selection
    act(() => {
      typeInInput(input1, 'Expand');
    });

    // Close the palette
    unmount1();
    document.body.innerHTML = '';

    // Reopen
    const { unmount: unmount2 } = renderPalette({ open: true, onClose });
    const input2 = queryPortal('.command-palette__input') as HTMLInputElement;

    // Query should be reset (showing all items)
    expect(input2?.value).toBe('');
    const items = queryPortalAll('.command-palette__item');
    expect(items.length).toBe(defaultActions.length);
    unmount2();
  });

  it('clamps selected index when list shrinks', () => {
    const actions = [
      makeAction({ id: 'a1', label: 'Alpha', category: 'generation' }),
      makeAction({ id: 'a2', label: 'Beta', category: 'navigation' }),
      makeAction({ id: 'a3', label: 'Gamma', category: 'editor' }),
    ];
    const { unmount } = renderPalette({ open: true, actions });
    const input = queryPortal('.command-palette__input') as HTMLInputElement;

    // Navigate to the last item
    keyDown(input, 'End');
    let items = queryPortalAll('.command-palette__item');
    expect(items[items.length - 1]?.classList.contains('command-palette__item--selected')).toBe(true);

    // Narrow the list (filter to one item)
    act(() => {
      typeInInput(input, 'Alpha');
    });

    // Selection should clamp to the only available item
    items = queryPortalAll('.command-palette__item');
    expect(items.length).toBe(1);
    expect(items[0]?.classList.contains('command-palette__item--selected')).toBe(true);
    unmount();
  });
});

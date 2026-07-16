/**
 * Root application component.
 *
 * Renders the three-pane app shell: Library, Workspace, Context Rail.
 * All configuration and selection state lives inside AppShell.
 *
 * Version: 0.2.0 | 2026-07-16
 */

import { AppShell } from './components/AppShell';

// ── Style imports ───────────────────────────────────────────────────────────────
// Tokens must load first so custom properties are available to all other sheets.
import './styles/tokens.css';
import './styles/app-shell.css';
import './styles/tree.css';
import './styles/workspace.css';
import './styles/context-rail.css';
import './styles/outline-workspace.css';
import './styles/variable-workspace.css';

function App(): JSX.Element {
  return <AppShell />;
}

export default App;

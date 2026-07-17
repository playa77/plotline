/**
 * SettingsWorkspace — full-pane settings form for project configuration.
 *
 * Collapsible sections: API Key, Models, Inference, Continuity Context,
 * Theme, Editor, and Backup Remote. Changes are saved per-section via
 * the `project:updateSettings` IPC command and persisted to the project
 * manifest on `refs/heads/main`.
 *
 * Version: 0.1.0 | 2026-07-17
 */

import { useState, useEffect, useCallback } from 'react';

import { invoke } from '../ipc/client';
import type { Project } from '../../shared/schemas/project';

import '../styles/settings-workspace.css';

// ── Props ──────────────────────────────────────────────────────────────────────

interface SettingsWorkspaceProps {
  /** Project ID. Defaults to 'demo' for early development. */
  projectId?: string;
}

// ── Collapsible section component ──────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = true }: SectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="settings-section">
      <button
        type="button"
        className="settings-section__header"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`settings-section__chevron${open ? ' settings-section__chevron--open' : ''}`}>
          ▶
        </span>
        <span>{title}</span>
      </button>
      {open && <div className="settings-section__body">{children}</div>}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SettingsWorkspace({
  projectId = 'demo',
}: SettingsWorkspaceProps): JSX.Element {
  // ── Loading state ─────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // ── API Key state ────────────────────────────────────────────────────────
  const [hasKey, setHasKey] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  // ── Load data on mount ───────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);

      // Load project
      try {
        const p = await invoke('project:open', { projectId });
        setProject(p);
        // Apply theme on load
        document.documentElement.setAttribute('data-theme', p.settings.theme);
      } catch (err) {
        console.warn('[SettingsWorkspace] project:open failed:', err);
      }

      // Check API key
      try {
        const { hasKey: hk } = await invoke('secrets:hasApiKey', {});
        setHasKey(hk);
      } catch (err) {
        console.warn('[SettingsWorkspace] secrets:hasApiKey failed:', err);
      }

      setLoading(false);
    })();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save helper ──────────────────────────────────────────────────────────

  const saveSettings = useCallback(
    async (partial: Record<string, unknown>) => {
      setSaveStatus('Saving…');
      try {
        const updated = await invoke('project:updateSettings', {
          projectId,
          settings: partial,
        });
        setProject(updated);
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        console.error('[SettingsWorkspace] save failed:', err);
        setSaveStatus('Save failed');
        setTimeout(() => setSaveStatus(null), 3000);
      }
    },
    [projectId],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSetApiKey = useCallback(async () => {
    if (!keyInput.trim()) return;
    try {
      await invoke('secrets:setApiKey', { key: keyInput.trim() });
      setHasKey(true);
      setShowKeyInput(false);
      setKeyInput('');
    } catch (err) {
      console.error('[SettingsWorkspace] secrets:setApiKey failed:', err);
    }
  }, [keyInput]);

  const handleRemoveApiKey = useCallback(async () => {
    try {
      await invoke('secrets:deleteApiKey', {});
      setHasKey(false);
      setShowKeyInput(false);
      setKeyInput('');
    } catch (err) {
      console.error('[SettingsWorkspace] secrets:deleteApiKey failed:', err);
    }
  }, []);

  const handleThemeChange = useCallback(
    (theme: string) => {
      if (theme !== 'dark' && theme !== 'light') return;
      document.documentElement.setAttribute('data-theme', theme);
      saveSettings({ theme });
    },
    [saveSettings],
  );

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="settings-workspace">
        <div className="settings-workspace__loading">Loading settings…</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="settings-workspace">
        <div className="settings-workspace__error">
          Could not load project settings. Make sure a project is open.
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const s = project.settings;

  return (
    <div className="settings-workspace">
      <div className="settings-workspace__header">
        <h1 className="settings-workspace__title">Settings</h1>
        {saveStatus && (
          <span className="settings-workspace__status">{saveStatus}</span>
        )}
      </div>

      <div className="settings-workspace__body">
        {/* ═══ API Key ═══════════════════════════════════════════════════════ */}
        <Section title="API Key">
          {hasKey ? (
            <div className="settings-field">
              <div className="settings-field__row">
                <span className="settings-field__indicator settings-field__indicator--configured">
                  ●
                </span>
                <span className="settings-field__label">API key is configured</span>
              </div>
              <div className="settings-field__actions">
                {showKeyInput ? (
                  <div className="settings-field__inline-form">
                    <input
                      type="password"
                      className="settings-input"
                      placeholder="Enter new API key"
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSetApiKey();
                        if (e.key === 'Escape') {
                          setShowKeyInput(false);
                          setKeyInput('');
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="settings-btn settings-btn--primary"
                      onClick={handleSetApiKey}
                      disabled={!keyInput.trim()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn--secondary"
                      onClick={() => {
                        setShowKeyInput(false);
                        setKeyInput('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="settings-btn settings-btn--secondary"
                      onClick={() => setShowKeyInput(true)}
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn--danger"
                      onClick={handleRemoveApiKey}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="settings-field">
              <div className="settings-field__row">
                <span className="settings-field__label">No API key configured</span>
              </div>
              <div className="settings-field__inline-form">
                <input
                  type="password"
                  className="settings-input"
                  placeholder="Enter your OpenRouter API key"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSetApiKey();
                  }}
                />
                <button
                  type="button"
                  className="settings-btn settings-btn--primary"
                  onClick={handleSetApiKey}
                  disabled={!keyInput.trim()}
                >
                  Set API Key
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* ═══ Models ════════════════════════════════════════════════════════ */}
        <Section title="Models">
          <ModelField
            label="Expand"
            provider={s.models.expand.provider}
            model={s.models.expand.model}
            onSave={(model, provider) => saveSettings({
              models: { ...s.models, expand: { provider: provider ?? s.models.expand.provider, model } },
            })}
          />
          <ModelField
            label="Write"
            provider={s.models.write.provider}
            model={s.models.write.model}
            onSave={(model, provider) => saveSettings({
              models: { ...s.models, write: { provider: provider ?? s.models.write.provider, model } },
            })}
          />
          <ModelField
            label="Iterate"
            provider={s.models.iterate.provider}
            model={s.models.iterate.model}
            onSave={(model, provider) => saveSettings({
              models: { ...s.models, iterate: { provider: provider ?? s.models.iterate.provider, model } },
            })}
          />
        </Section>

        {/* ═══ Inference ═════════════════════════════════════════════════════ */}
        <Section title="Inference">
          <TextField
            label="Base URL"
            value={s.inference.baseUrl}
            placeholder="https://openrouter.ai/api/v1"
            onSave={(value) => saveSettings({
              inference: { baseUrl: value },
            })}
          />
        </Section>

        {/* ═══ Continuity Context ════════════════════════════════════════════ */}
        <Section title="Continuity Context">
          <ToggleField
            label="Pass preceding chapter's ending as context"
            checked={s.continuityContext.enabled}
            onChange={(enabled) => saveSettings({
              continuityContext: { enabled, words: s.continuityContext.words },
            })}
          />
          {s.continuityContext.enabled && (
            <NumberField
              label="Word budget"
              value={s.continuityContext.words}
              min={100}
              max={2000}
              onSave={(words) => saveSettings({
                continuityContext: { enabled: s.continuityContext.enabled, words },
              })}
            />
          )}
        </Section>

        {/* ═══ Theme ═════════════════════════════════════════════════════════ */}
        <Section title="Theme">
          <RadioGroup
            label="Appearance"
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
            value={s.theme}
            onChange={handleThemeChange}
          />
        </Section>

        {/* ═══ Editor ════════════════════════════════════════════════════════ */}
        <Section title="Editor">
          <RadioGroup
            label="Draft font mode"
            options={[
              { value: 'serif', label: 'Serif' },
              { value: 'mono', label: 'Monospace' },
            ]}
            value={s.editor.fontMode}
            onChange={(fontMode) => saveSettings({
              editor: { fontMode: fontMode as 'serif' | 'mono' },
            })}
          />
        </Section>

        {/* ═══ Backup Remote ═════════════════════════════════════════════════ */}
        <Section title="Backup Remote">
          <TextField
            label="Git remote URL"
            value={s.backupRemote ?? ''}
            placeholder="https://github.com/user/repo.git"
            nullable
            onSave={(value) => saveSettings({
              backupRemote: value || null,
            })}
          />
        </Section>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface ModelFieldProps {
  label: string;
  provider: string;
  model: string;
  onSave: (model: string, provider?: string) => void;
}

function ModelField({ label, provider, model, onSave }: ModelFieldProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [modelInput, setModelInput] = useState(model);
  const [providerInput, setProviderInput] = useState(provider);

  const handleSave = () => {
    if (modelInput.trim()) {
      onSave(modelInput.trim(), providerInput.trim() || undefined);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setModelInput(model);
    setProviderInput(provider);
    setEditing(false);
  };

  return (
    <div className="settings-field">
      <div className="settings-field__row">
        <span className="settings-field__label">{label}</span>
        <span className="settings-field__value">
          {provider}/{model}
        </span>
      </div>
      {editing ? (
        <div className="settings-field__inline-form">
          <input
            className="settings-input settings-input--sm"
            placeholder="Provider (e.g. openrouter)"
            value={providerInput}
            onChange={(e) => setProviderInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(false);
            }}
          />
          <input
            className="settings-input settings-input--sm"
            placeholder="Model (e.g. anthropic/claude-sonnet-4-20250514)"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            autoFocus
          />
          <button
            type="button"
            className="settings-btn settings-btn--primary settings-btn--sm"
            onClick={handleSave}
            disabled={!modelInput.trim()}
          >
            Save
          </button>
          <button
            type="button"
            className="settings-btn settings-btn--secondary settings-btn--sm"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="settings-btn settings-btn--secondary settings-btn--sm"
          onClick={() => setEditing(true)}
        >
          Change
        </button>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  nullable?: boolean;
  onSave: (value: string) => void;
}

function TextField({ label, value, placeholder, nullable, onSave }: TextFieldProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value);

  const handleSave = () => {
    onSave(input);
    setEditing(false);
  };

  const handleCancel = () => {
    setInput(value);
    setEditing(false);
  };

  // Sync external value changes (when another save resets the project)
  useEffect(() => {
    if (!editing) setInput(value);
  }, [value, editing]);

  return (
    <div className="settings-field">
      <div className="settings-field__row">
        <span className="settings-field__label">{label}</span>
        <span className="settings-field__value">
          {nullable && !value ? (
            <span className="settings-field__value--none">Not set</span>
          ) : (
            value
          )}
        </span>
      </div>
      {editing ? (
        <div className="settings-field__inline-form">
          <input
            className="settings-input"
            type="text"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            autoFocus
          />
          <button
            type="button"
            className="settings-btn settings-btn--primary"
            onClick={handleSave}
          >
            Save
          </button>
          <button
            type="button"
            className="settings-btn settings-btn--secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="settings-btn settings-btn--secondary settings-btn--sm"
          onClick={() => setEditing(true)}
        >
          Change
        </button>
      )}
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleField({ label, checked, onChange }: ToggleFieldProps): JSX.Element {
  return (
    <div className="settings-field">
      <label className="settings-toggle">
        <input
          type="checkbox"
          className="settings-toggle__input"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="settings-toggle__track">
          <span className="settings-toggle__thumb" />
        </span>
        <span className="settings-field__label">{label}</span>
      </label>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onSave: (value: number) => void;
}

function NumberField({ label, value, min, max, onSave }: NumberFieldProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value));

  const handleSave = () => {
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      onSave(num);
    }
    setEditing(false);
  };

  return (
    <div className="settings-field">
      <div className="settings-field__row">
        <span className="settings-field__label">{label}</span>
        <span className="settings-field__value">{value}</span>
      </div>
      {editing ? (
        <div className="settings-field__inline-form">
          <input
            className="settings-input settings-input--sm"
            type="number"
            min={min}
            max={max}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setInput(String(value));
                setEditing(false);
              }
            }}
            autoFocus
          />
          <button
            type="button"
            className="settings-btn settings-btn--primary settings-btn--sm"
            onClick={handleSave}
          >
            Save
          </button>
          <button
            type="button"
            className="settings-btn settings-btn--secondary settings-btn--sm"
            onClick={() => {
              setInput(String(value));
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="settings-btn settings-btn--secondary settings-btn--sm"
          onClick={() => setEditing(true)}
        >
          Change
        </button>
      )}
    </div>
  );
}

interface RadioGroupProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}

function RadioGroup({ label, options, value, onChange }: RadioGroupProps): JSX.Element {
  return (
    <div className="settings-field">
      <span className="settings-field__label">{label}</span>
      <div className="settings-radio-group">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`settings-radio${value === opt.value ? ' settings-radio--selected' : ''}`}
          >
            <input
              type="radio"
              className="settings-radio__input"
              name={label}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <span className="settings-radio__dot" />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

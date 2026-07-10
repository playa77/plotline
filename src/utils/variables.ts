// Version: 1.0.0 | 2026-07-10
// Variable scanning utilities — detects {{variables.<name>}} placeholders in
// workflow prompt files and loads their current values from disk.
//
// The backend's substitution regex is \{\{variables\.([a-zA-Z0-9_-]+)\}\} (see
// src-tauri/src/substitution.rs). We replicate it here so the frontend can
// show users exactly which variables a workflow needs before it runs.
//
// Variable files live at <project_root>/variables/<name>.md and are read live
// at execution time (not snapshotted). The run dialog passes edited values to
// the backend as variable_overrides, which take precedence over file-based
// values without mutating any project files on disk.

import * as api from "../api/tauri";

/** Mirrors the backend regex in substitution.rs. */
const VARIABLE_REGEX = /\{\{variables\.([a-zA-Z0-9_-]+)\}\}/g;

export interface VariableInfo {
  /** Raw variable name as it appears in {{variables.<name>}}, e.g. "chapter_number". */
  name: string;
  /** Human-readable label, e.g. "Chapter Number". */
  label: string;
  /** Current content of <project_root>/variables/<name>.md, or "" if the file doesn't exist. */
  defaultValue: string;
  /** Whether a variable file already exists on disk. */
  hasDefault: boolean;
  /** Step names whose prompt files reference this variable. */
  referencedBy: string[];
}

/**
 * Converts a snake/kebab-case variable name to a human-readable Title Case label.
 * "book_outline" → "Book Outline", "chapter-number" → "Chapter Number".
 */
export function titleCaseFromVariableName(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Lightweight workflow YAML parser
// ---------------------------------------------------------------------------

// We avoid adding js-yaml as a dependency by parsing the simple workflow format
// line-by-line. The backend already validates the YAML via serde_yaml, so by
// the time we reach this code the file is known-good. We only need to extract
// step names and their prompt_file paths — enough to know which files to scan.

interface ParsedStep {
  name: string;
  prompt_file: string;
}

/** Strips surrounding quotes and trailing whitespace from a YAML scalar value. */
function cleanYamlValue(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "").trim();
}

/**
 * Extracts step name + prompt_file pairs from a workflow YAML string.
 * Handles standard 2-space indentation, quoted values, and arbitrary field
 * ordering within each step entry.
 */
function extractStepsFromYaml(yaml: string): ParsedStep[] {
  const steps: ParsedStep[] = [];
  const lines = yaml.split("\n");

  let inStepsSection = false;
  let currentStep: Partial<ParsedStep> | null = null;

  for (const line of lines) {
    // Top-level "steps:" key — enter the section.
    if (/^steps:\s*$/.test(line)) {
      inStepsSection = true;
      continue;
    }

    // A non-indented, non-empty, non-comment line means we've left the section.
    if (inStepsSection && line.length > 0 && !/^\s/.test(line) && !line.startsWith("#")) {
      if (currentStep?.name && currentStep?.prompt_file) {
        steps.push(currentStep as ParsedStep);
      }
      currentStep = null;
      inStepsSection = false;
      continue;
    }

    if (!inStepsSection) continue;

    // A line starting with "- " begins a new step entry.
    if (/^\s*-\s+/.test(line)) {
      if (currentStep?.name && currentStep?.prompt_file) {
        steps.push(currentStep as ParsedStep);
      }
      currentStep = {};

      // The first field may sit on the same line as the dash.
      const inlineName = line.match(/^\s*-\s+name:\s*(.+)/);
      const inlinePrompt = line.match(/^\s*-\s+prompt_file:\s*(.+)/);
      if (inlineName) {
        currentStep.name = cleanYamlValue(inlineName[1]);
      } else if (inlinePrompt) {
        currentStep.prompt_file = cleanYamlValue(inlinePrompt[1]);
      }
    } else if (currentStep) {
      const nameMatch = line.match(/^\s+name:\s*(.+)/);
      const promptMatch = line.match(/^\s+prompt_file:\s*(.+)/);
      if (nameMatch) {
        currentStep.name = cleanYamlValue(nameMatch[1]);
      } else if (promptMatch) {
        currentStep.prompt_file = cleanYamlValue(promptMatch[1]);
      }
    }
  }

  // Flush the last step.
  if (currentStep?.name && currentStep?.prompt_file) {
    steps.push(currentStep as ParsedStep);
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Path helper
// ---------------------------------------------------------------------------

/**
 * Joins path segments with forward slashes. The backend's readFileContent
 * canonicalizes via PathBuf, which accepts "/" on all platforms, so this is
 * safe cross-platform. Strips trailing/leading separators on each segment.
 */
function joinPath(...parts: string[]): string {
  return parts
    .map((p, i) =>
      i === 0
        ? p.replace(/[/\\]+$/, "")
        : p.replace(/^[/\\]+|[/\\]+$/g, "")
    )
    .filter(Boolean)
    .join("/");
}

// ---------------------------------------------------------------------------
// Main scanning function
// ---------------------------------------------------------------------------

/**
 * Scans a workflow's prompt files for {{variables.<name>}} placeholders and
 * loads each variable's current value from disk.
 *
 * Returns a sorted list of VariableInfo. If the workflow YAML can't be read
 * or parsed, returns an empty array — the backend will surface validation
 * errors when run_workflow is called.
 *
 * @param workflowPath Absolute path to the workflow YAML file
 * @param projectRoot  Absolute path to the project root directory
 */
export async function scanWorkflowVariables(
  workflowPath: string,
  projectRoot: string
): Promise<VariableInfo[]> {
  // 1. Read the workflow YAML.
  let yaml: string;
  try {
    yaml = await api.readFileContent(workflowPath);
  } catch {
    // If the YAML can't be read, we can't scan for variables. Return empty —
    // the backend will report the error when run_workflow is invoked.
    return [];
  }

  // 2. Extract step names + prompt_file paths.
  const steps = extractStepsFromYaml(yaml);
  if (steps.length === 0) return [];

  // 3. Read each prompt file and collect variable references.
  //    Use allSettled so one missing prompt file doesn't block the rest.
  const promptResults = await Promise.allSettled(
    steps.map((step) =>
      api.readFileContent(joinPath(projectRoot, step.prompt_file))
    )
  );

  // Map: variable name → set of step names that reference it.
  const varMap = new Map<string, Set<string>>();

  for (let i = 0; i < steps.length; i++) {
    const result = promptResults[i];
    if (result.status !== "fulfilled") continue;

    const content = result.value;
    for (const match of content.matchAll(VARIABLE_REGEX)) {
      const varName = match[1];
      if (!varMap.has(varName)) {
        varMap.set(varName, new Set());
      }
      varMap.get(varName)!.add(steps[i].name);
    }
  }

  if (varMap.size === 0) return [];

  // 4. For each variable, try to read its file from <project_root>/variables/<name>.md.
  //    Use allSettled again — missing files are expected (user hasn't created them yet).
  const varEntries = Array.from(varMap.entries());
  const fileResults = await Promise.allSettled(
    varEntries.map(([name]) =>
      api.readFileContent(joinPath(projectRoot, "variables", `${name}.md`))
    )
  );

  const variables: VariableInfo[] = [];

  for (let i = 0; i < varEntries.length; i++) {
    const [name, referencedBy] = varEntries[i];
    const result = fileResults[i];

    let defaultValue = "";
    let hasDefault = false;

    if (result.status === "fulfilled") {
      defaultValue = result.value;
      hasDefault = true;
    }

    variables.push({
      name,
      label: titleCaseFromVariableName(name),
      defaultValue,
      hasDefault,
      referencedBy: Array.from(referencedBy),
    });
  }

  // Sort alphabetically by name for stable ordering in the dialog.
  variables.sort((a, b) => a.name.localeCompare(b.name));

  return variables;
}

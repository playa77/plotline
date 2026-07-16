// Version: 1.0.0 | 2026-07-16
// Snapshot browser: GitHub-style file tree + read-only CodeMirror content
// viewer. Lets users browse the frozen snapshot of a completed (or in-progress)
// run — workflow YAML, prompt files, and step outputs.

import { useState, useEffect, useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import * as api from "../api/tauri";
import type { RunFileEntry } from "../types";
import styles from "./SnapshotBrowser.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SnapshotBrowserProps {
  runDir: string;
  runName: string;
  onClose: () => void;
}

/** A node in the file tree, built from flat RunFileEntry[]. */
interface TreeNode {
  name: string;
  path: string; // relative path within the run dir
  isDir: boolean;
  size: number;
  children: TreeNode[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** File extension → icon character. Fall through to "file" for unknown. */
function fileIcon(name: string, isDir: boolean): string {
  if (isDir) return "\u{1F4C1}"; // 📁
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
      return "\u{1F4C4}"; // 📄 (markdown)
    case "yaml":
    case "yml":
      return "\u2699\uFE0F"; // ⚙️ (config)
    case "json":
      return "\u{1F4CB}"; // 📋 (clipboard/json)
    default:
      return "\u{1F4C4}"; // 📄 (generic file)
  }
}

/**
 * Build a nested TreeNode from a flat RunFileEntry[].
 *
 * The Rust backend skips the `_prompts/` directory entry itself but includes
 * its children with paths like `_prompts/body_prompt.md`. We synthesize a
 * `_prompts` directory node to host those children so the user can collapse
 * the prompt snapshot sub-tree.
 */
function buildFileTree(entries: RunFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  // Index synthetic directories by their name so we can inject children later.
  const dirLookup = new Map<string, TreeNode>();

  for (const entry of entries) {
    const parts = entry.path.split("/");

    if (parts.length === 1) {
      // Root-level entry
      const node: TreeNode = {
        name: entry.name,
        path: entry.path,
        isDir: entry.is_dir,
        size: entry.size,
        children: [],
      };
      root.push(node);
      if (entry.is_dir) {
        dirLookup.set(entry.name, node);
      }
    } else {
      // Nested entry — ensure intermediate directories exist
      let currentLevel = root;
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        if (isLast) {
          // Leaf node
          currentLevel.push({
            name: part,
            path: currentPath,
            isDir: entry.is_dir,
            size: entry.size,
            children: [],
          });
        } else {
          // Intermediate directory — find or create
          let dirNode = dirLookup.get(currentPath);
          if (!dirNode) {
            // Check if it already exists in currentLevel
            dirNode = currentLevel.find(
              (n) => n.name === part && n.isDir
            )!;
            if (!dirNode) {
              dirNode = {
                name: part,
                path: currentPath,
                isDir: true,
                size: 0,
                children: [],
              };
              currentLevel.push(dirNode);
              dirLookup.set(currentPath, dirNode);
            }
          }
          currentLevel = dirNode.children;
        }
      }
    }
  }

  // Sort: directories first, then files, alphabetically within each group
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.isDir) sortNodes(n.children);
    }
  };
  sortNodes(root);

  return root;
}

// CodeMirror language mode inference from file extension.
function getExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  // For .md, .yaml, .json — markdown mode renders them all reasonably well
  // as plain text. Markdown mode is the safest default for the snapshot
  // browser because most files (prompts, step outputs) are markdown.
  if (ext === "md" || ext === "yaml" || ext === "yml" || ext === "json") {
    return [markdown()];
  }
  return [markdown()];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SnapshotBrowser({ runDir, runName, onClose }: SnapshotBrowserProps) {
  const [entries, setEntries] = useState<RunFileEntry[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Selected file state
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  // Expanded directory paths (Set of relative paths)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Default: root level expanded, _prompts collapsed
    const s = new Set<string>();
    s.add(""); // root
    return s;
  });

  // Build tree from flat entries
  const tree = useMemo(() => buildFileTree(entries), [entries]);

  // Load file listing on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoadingTree(true);
      setTreeError(null);
      try {
        const files = await api.listRunFiles(runDir);
        if (!cancelled) {
          // The Rust list_run_files sorts dirs-first alphabetically,
          // but we sort again after tree building anyway.
          setEntries(files);
        }
      } catch (err) {
        if (!cancelled) {
          setTreeError(String(err));
        }
      } finally {
        if (!cancelled) setIsLoadingTree(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [runDir]);

  // Load file content when a file is selected
  const handleSelectFile = useCallback(
    async (nodePath: string) => {
      setSelectedPath(nodePath);
      setIsLoadingContent(true);
      setContentError(null);
      try {
        const content = await api.readFileContent(`${runDir}/${nodePath}`);
        setFileContent(content);
      } catch (err) {
        setContentError(String(err));
        setFileContent("");
      } finally {
        setIsLoadingContent(false);
      }
    },
    [runDir]
  );

  // Toggle directory open/close
  const toggleDir = useCallback(
    (dirPath: string) => {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(dirPath)) {
          next.delete(dirPath);
        } else {
          next.add(dirPath);
        }
        return next;
      });
    },
    []
  );

  // --- Rendering helpers ---

  const renderTreeNode = (node: TreeNode, depth: number) => {
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.path}>
        <button
          className={`${styles.treeItem} ${isSelected ? styles.treeItemActive : ""}`}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          onClick={() => {
            if (node.isDir) {
              toggleDir(node.path);
            } else {
              handleSelectFile(node.path);
            }
          }}
          title={node.path}
        >
          {/* Toggle arrow for directories */}
          {node.isDir ? (
            <span
              className={`${styles.treeArrow} ${isExpanded ? styles.treeArrowOpen : ""}`}
            >
              &#8250;
            </span>
          ) : (
            <span className={styles.treeArrowPlaceholder} />
          )}
          <span className={styles.treeIcon}>
            {fileIcon(node.name, node.isDir)}
          </span>
          <span className={styles.treeName}>{node.name}</span>
          {!node.isDir && node.size > 0 && (
            <span className={styles.treeSize}>
              {formatBytes(node.size)}
            </span>
          )}
        </button>

        {node.isDir && isExpanded && node.children.length > 0 && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}

        {node.isDir && isExpanded && node.children.length === 0 && (
          <div
            className={styles.treeEmpty}
            style={{ paddingLeft: `${12 + (depth + 1) * 14}px` }}
          >
            Empty directory
          </div>
        )}
      </div>
    );
  };

  // Derive the selected file name from the path
  const selectedFileName = selectedPath
    ? selectedPath.split("/").pop() ?? selectedPath
    : null;

  return (
    <div className={styles.container}>
      {/* ---------- Header bar ---------- */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}>
            <span className={styles.breadcrumbRoot}>{runName}</span>
            {selectedPath && (
              <>
                <span className={styles.breadcrumbSep}>/</span>
                <span className={styles.breadcrumbPath}>
                  {selectedPath.split("/").join(" / ")}
                </span>
              </>
            )}
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* ---------- Body: file tree + content viewer ---------- */}
      <div className={styles.body}>
        {/* Left: file tree */}
        <div className={styles.treePanel}>
          {isLoadingTree ? (
            <div className={styles.loadingState}>Loading files...</div>
          ) : treeError ? (
            <div className={styles.errorState}>{treeError}</div>
          ) : tree.length === 0 ? (
            <div className={styles.emptyState}>
              No files found in this snapshot.
            </div>
          ) : (
            <div className={styles.treeScroll}>
              {tree.map((node) => renderTreeNode(node, 0))}
            </div>
          )}
        </div>

        {/* Right: content viewer */}
        <div className={styles.viewerPanel}>
          {!selectedPath ? (
            <div className={styles.viewerPlaceholder}>
              <span className={styles.placeholderIcon}>&#128196;</span>
              <p>Select a file from the tree to view its contents.</p>
            </div>
          ) : isLoadingContent ? (
            <div className={styles.loadingState}>Loading content...</div>
          ) : contentError ? (
            <div className={styles.errorState}>{contentError}</div>
          ) : (
            <>
              {/* File tab/title */}
              <div className={styles.viewerHeader}>
                <span className={styles.viewerFileName}>
                  {fileIcon(selectedFileName ?? "", false)}{" "}
                  {selectedFileName}
                </span>
              </div>
              {/* CodeMirror editor */}
              <div className={styles.viewerEditor}>
                <CodeMirror
                  value={fileContent}
                  readOnly={true}
                  extensions={getExtension(selectedFileName ?? "")}
                  theme="dark"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: false,
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

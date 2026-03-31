---
description: Initialize AGENTS.md for the entire repository including all nested modules, using parallel worker subagents per module then a root synthesis pass
---

Run a full recursive repository initialization using the subagent tool.

## Phase 1 — Discovery

Before calling any subagent, perform a lightweight census yourself:

1. List the repository root directory.
2. Find all directories that contain a manifest file signaling a module boundary:
   - `package.json` (Node/npm)
   - `pyproject.toml` (Python)
   - `go.mod` (Go)
   - `Cargo.toml` (Rust)
   - `build.gradle` or `pom.xml` (JVM)
3. For each found manifest, record its **absolute path** and **relative path from the repository root**.
4. Skip the repository root itself — it is handled in Phase 3.
5. Skip `node_modules/`, `dist/`, `build/`, `.git/`, and other generated/vendor directories.
6. Handle nesting: if `packages/foo` and `packages/foo/src/sub` both have manifests, include both only if `src/sub` has a genuinely independent purpose. Otherwise list `src/sub` as a submodule note inside `packages/foo`'s task, not as a separate entry.

## Phase 2 — Parallel module initialization

Call the subagent tool **once** in parallel mode with one task per discovered module.

For each module, the task string must be self-contained because the worker has no other context. Use this exact structure, substituting `{relPath}` and `{absPath}`:

> Initialize `AGENTS.md` for the module at `{relPath}` (your working directory is `{absPath}`).
>
> Scanning strategy:
> 1. Read the manifest file (`package.json` or equivalent) for name, dependencies, scripts.
> 2. List the top-level source directory (`src/`, `lib/`, or equivalent).
> 3. Read the main entry file in full if under 150 lines; skim the first 60 lines if longer.
> 4. For each significant subdirectory: list its contents and read 1–3 representative files.
> 5. Find test files (`test/`, `*.test.ts`, `spec/`) and read one as an example.
> 6. Stop when you have enough to fill all required sections.
>
> Write `AGENTS.md` in the current directory with these sections:
> - Breadcrumb at the very top: `Breadcrumbs: \`AGENTS.md\` -> \`{relPath}/AGENTS.md\``
> - **Purpose** — one paragraph on what this module does and why it exists
> - **Entry Points** — main files a consumer starts from
> - **Directory Map** — annotated tree of `src/` subdirectories, one line per grouping
> - **Interfaces And Dependencies** — key exported types/interfaces, internal workspace deps, significant external deps
> - **Tests** — where they live, how to run them, what they cover
> - **Working Notes** — gotchas, conventions, areas of active churn, files to read before editing
> - **Submodules** — if this module contains subdirectories with their own manifests, list them here; do NOT recurse into them
> - **Scan Snapshot** — `Updated: <ISO timestamp>` and a note on scan depth
>
> Only write documentation. Do not modify source code. Do not recurse into submodule directories.
>
> When done, output:
> ```
> Module: {relPath}
> AGENTS.md: created | updated
> Entry points: <list>
> Submodules found: <list or none>
> ```

Set `cwd` on each task to the **absolute path** of that module.

Cap at 8 parallel tasks. If there are more than 8 modules, run them in batches of 8, waiting for each batch to complete before starting the next. After each batch, note which modules failed (non-zero exit or error stopReason) and retry them once as single tasks before continuing.

## Phase 3 — Root synthesis

After all batches complete, call the subagent tool in **single mode**:

- Agent: `worker`
- `cwd`: the repository root
- Task:

> Synthesize the root `AGENTS.md` for this repository. All module `AGENTS.md` files have already been written. Read each one and produce the root document.
>
> Modules to index (relative paths): $@
>
> Scanning strategy:
> 1. List the repository root.
> 2. Read the root manifest and any workspace config.
> 3. Read each module's `AGENTS.md` in full.
> 4. Skim root-level config files (`tsconfig.json`, `.eslintrc`, `CONTRIBUTING.md`, etc.) for global standards.
> 5. Do NOT re-read module source files — the module `AGENTS.md` files are the source of truth.
>
> Write or update root `AGENTS.md` with these sections:
> - **Vision** — 2–4 sentences on what this repo is and what it delivers
> - **Workspace Map** — Mermaid `flowchart TD` showing modules and dependency relationships (extract deps from each module's "Interfaces And Dependencies" section)
> - **Architecture Overview** — Mermaid `flowchart LR` showing logical data/control flow between modules with labeled edges
> - **Module Index** — markdown table: Module | Purpose | Local context (link to module `AGENTS.md`)
> - **Global Standards** — repo-wide conventions inferred from workspace config, tooling, and patterns visible in module docs
> - **Scan Status** — strategy used, estimated tracked files, reads performed, modules with full vs. shallow coverage, recommended next deep-dive paths
>
> If the root `AGENTS.md` already exists, update it rather than replacing it wholesale — preserve any hand-written sections not covered by the template above.
>
> Only write documentation. Do not modify source code.

Replace `$@` with the comma-separated list of module relative paths from Phase 1.

## Phase 4 — Final report

After the root agent finishes, print this to the user:

```
## Initialization Complete

Modules initialized: N
Root AGENTS.md: created | updated
Mermaid diagrams: workspace map + architecture overview

### Per-module status
| Module       | Status   | Notes             |
| ------------ | -------- | ----------------- |
| packages/foo | ✓        | ...               |
| packages/bar | ✗ failed | retry also failed |

### Coverage gaps
Any modules that failed, were skipped, or where the worker flagged shallow coverage.

### Recommended next steps
Nested submodules flagged by workers that were not separately initialized — candidates for a follow-up /init-repo run scoped to those paths.
```

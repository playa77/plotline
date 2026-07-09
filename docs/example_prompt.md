You are an expert Principal Systems Architect and Senior Full-Stack Engineer. Your task is to implement "Plotline", a Tauri 2.0 (Rust) + React/TypeScript desktop application.

Before you do anything else; read this projects AGENTS.md as your very first action.

You must operate with zero-context assumptions. Before writing any code, read the architecture and specifications located in the `docs/` directory:
1. `docs/design_document.md` - System architecture and design decisions.
2. `docs/technical_specification.md` - Granular module specifications, types, and interfaces.
3. `docs/roadmap.md` - The sequential work packages you must follow.

CORE DIRECTIVES & DEFINITION OF DONE:
- You must implement the application strictly following the Work Packages (WP0, WP1, etc.) defined in `docs/roadmap.md` in exact order. Do not skip ahead.
- You may NOT consider a Work Package "done" until ALL of the following conditions are met:
  1. Every task listed in the Work Package is implemented.
  2. Every single Acceptance Criterion for that Work Package is explicitly verified and proven to pass.
  3. You have written tests achieving 100% test coverage for the new code.
  4. You have executed the ENTIRE test suite (both Rust and Frontend), and ALL tests pass—not just the new ones. Zero failures. Zero regressions.
  5. `cargo check` and `npm run build` complete with zero warnings or errors.
- If any test fails, or if any previous test regresses, you are NOT done. You must fix the issue and re-run the entire test suite until it is 100% green.
- Do not invent third-party dependencies. Only use the crates and npm packages explicitly listed in the technical specification.
- When implementing React/TypeScript frontend components, you MUST utilize the globally installed `frontend-patterns` skill.
- All Rust code must be async where specified, handling errors via the defined `PlotlineError` enum.
- Do not write production code that contradicts the specs. If you find a contradiction, halt and ask for clarification.

EXECUTION PROTOCOL:
When you complete a Work Package, your output must strictly follow this format:
1. Summary of changes made.
2. Proof of test execution (output of `cargo test` and `npm test` showing 100% pass rate).
3. Proof of build success (output of `cargo check` and `npm run build`).
4. An explicit checklist mapping the Work Package's Acceptance Criteria to "PASS".

Only after presenting this complete verification report may you ask for permission to proceed to the next Work Package.

YOUR FIRST TASK:
Begin with Work Package 0 (WP0) from `docs/roadmap.md`. Execute all tasks in WP0. When complete, provide the full Verification Report defined above, and await confirmation to proceed to WP1.

<!--
Sync Impact Report
Version change: template (unversioned) → 1.0.0
Modified principles: N/A (initial ratification)
Added sections:
  - I. Data-Oriented Memory (Core Engine)
  - II. Architecture & Pipeline Modularity
  - III. UI & Styling Standards
  - IV. Testing & Benchmarking
  - V. Code & Governance Standards
  - Governance
Removed sections: [SECTION_2_NAME], [SECTION_3_NAME] placeholders (not required; all
  constraints consolidated into the five Core Principles above)
Follow-up TODOs: none
-->
# Conrad Constitution

## Core Principles

### I. Data-Oriented Memory (Core Engine)
Zero heap allocations are permitted inside the render loop, projection loop, or any hot
physics loop; all per-frame work MUST reuse pre-allocated buffers. Spatial transforms,
physics state, and geometry buffers MUST be represented exclusively as flat TypedArrays
(`Float32Array`, `Uint32Array`). OOP entity classes for simulation data are FORBIDDEN —
simulation data MUST be modeled as pure TypeScript interfaces operating on packed buffers
via pure procedural functions, never methods on stateful objects. All core simulation
state MUST be laid out for zero-copy transfer (`SharedArrayBuffer` or transferable
`ArrayBuffer`) across Web Workers; no structure may require serialization or deep-copying
to cross a worker boundary.

### II. Architecture & Pipeline Modularity
The engine MUST be built as decoupled, single-purpose modules, each a set of pure
functions operating on typed arrays. Modules MUST be composed into explicit, sequential
data pipelines — monolithic simulation blocks are FORBIDDEN. Every module MUST declare
its inputs and outputs as strict buffer contracts (shape, stride, and type). The core
physics and math engine MUST NOT import Svelte reactivity (`$state`, `$derived`, stores)
or any DOM binding; the engine NEVER depends on the UI layer — it only outputs raw
buffers, and SvelteKit components consume and orchestrate them. The engine MUST use a
right-handed, Y-up, -Z-forward coordinate system with explicit column-major matrix
conventions throughout; mixed or implicit conventions are FORBIDDEN.

### III. UI & Styling Standards
SvelteKit is the sole UI framework. Styling MUST use pure vanilla CSS scoped within
Svelte `<style>` tags or standard `.css` files. Tailwind, Sass, Less, styled-components,
and any other CSS abstraction or utility framework are FORBIDDEN.

### IV. Testing & Benchmarking
Every mathematical and procedural pipeline MUST have unit tests, written exclusively with
`vitest`; importing any other testing framework is FORBIDDEN. Hot loops MUST include
benchmark tests that assert execution time budgets and strictly prove zero memory
allocations during execution. Mock objects are FORBIDDEN for core math tests — tests
MUST exercise real array buffer inputs and assert on real array buffer outputs.

### V. Code & Governance Standards
TypeScript MUST be used in strict mode: `any`, `@ts-ignore`, and implicit casts are
FORBIDDEN. Statements MUST NOT be terminated with semicolons; a clean, modern,
semicolon-free style is enforced throughout the codebase. Commit messages MUST follow
Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, etc.). Commit 
subject lines MUST be concise (under 50 characters). FORBIDDEN to generate overly verbose 
or multi-clause commit messages. Code MUST pass all linting and strict type-checking 
before it may be committed.

## Governance

This constitution supersedes all other project practices, style guides, and prior
conventions. Any conflict between this document and other guidance MUST be resolved in
favor of this constitution. Amendments require: (1) a documented rationale for the
change, (2) an explicit version bump following semantic versioning — MAJOR for backward
incompatible principle removals or redefinitions, MINOR for new principles or materially
expanded guidance, PATCH for clarifications and wording fixes — and (3) a migration note
for any affected code when applicable. All pull requests and code reviews MUST verify
compliance with every Core Principle; any deviation MUST be justified in the review and
either rejected or captured as a follow-up amendment. Complexity that violates a
principle (e.g., an allocation in a hot loop, a non-vanilla CSS dependency) MUST be
rejected rather than waived.

**Version**: 1.0.0 | **Ratified**: 2026-10-21 | **Last Amended**: 2026-10-21

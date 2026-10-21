# Conrad Constitution

## Core Principles

### I. Data-Oriented Memory (Core Engine)
Zero heap allocations are permitted inside the render loop, blending pipeline, raycasting loop, or any hot pixel-processing loop; all per-frame work MUST reuse pre-allocated buffers. Pixel buffers, image data, convolution kernels, and blending states MUST be represented exclusively as flat TypedArrays (`Uint8Array`, `Uint16Array`, `Float32Array`). OOP entity classes for image data and spatial physics are FORBIDDEN — simulation and processing MUST be modeled as pure interfaces operating on packed buffers via pure procedural functions, never methods on stateful objects. All core rendering state MUST be laid out for zero-copy transfer (`SharedArrayBuffer` or transferable `ArrayBuffer`) across Web Workers.

### II. Architecture & Pipeline Modularity
The engine MUST be built as decoupled, single-purpose modules composed into explicit, sequential pipelines — monolithic processing blocks are FORBIDDEN. Every module MUST declare its inputs and outputs as strict buffer contracts. 
**Strict Client-Side Execution (Core Engine):** The interactive simulation MUST run entirely client-side within the browser. The engine MUST use native browser APIs (WebGPU, Canvas) via TypeScript or WebAssembly. Server-side simulation, remote rendering, or reliance on a backend compute API for the live application is strictly FORBIDDEN. 
**Backend & Asset Tooling Exemption:** Offline tools, asset pipelines, and backend generation scripts (e.g., pre-rendering 2D radiographs from 3D models) are EXEMPT from the client-side execution rule. These tools are strictly for developer use during build or asset preparation. The final web application accessed by end users MUST remain 100% client-side with zero backend compute dependencies. Developer tools may execute via CLI or local backend, and may utilize any appropriate runtime, language, or native binary (e.g., Rust, Node, Python, C++).
**Spatial and Projection Rules:** The engine MUST support 3D spatial math, linear algebra, and volumetric data (e.g., raycasting, 3D transforms) necessary to project 3D models into 2D radiographic images. When outputting or processing the final 2D pixel buffers, the engine MUST treat coordinates as 2D grids (origin top-left) with explicit row-major flat array indexing. Pipelines MUST default to single-channel (grayscale) logic unless an alpha or color channel is explicitly required.

### III. UI & Interactivity Standards
SvelteKit is the sole UI framework. The core math and pixel engine MUST NOT import Svelte reactivity (`$state`, `$derived`, stores) or any DOM binding; the engine NEVER depends on the UI layer — it only outputs raw buffers, and SvelteKit components consume and render them. Styling MUST use pure vanilla CSS scoped within Svelte `<style>` tags or standard `.css` files. Tailwind, Sass, Less, styled-components, and any other CSS abstraction or utility framework are FORBIDDEN.

### IV. Testing & Benchmarking
Every mathematical, spatial, and pixel manipulation pipeline MUST have unit tests, written exclusively with `vitest`; importing any other testing framework is FORBIDDEN. Hot loops MUST include benchmark tests that assert execution time budgets and strictly prove zero memory allocations during execution. Mock objects are FORBIDDEN for core math tests — tests MUST exercise real array buffer inputs and assert on real array buffer outputs.

### V. Code, Git & Governance Standards
TypeScript MUST be used in strict mode: `any`, `@ts-ignore`, and implicit casts are FORBIDDEN. Statements MUST NOT be terminated with semicolons; a clean, modern, semicolon-free style is enforced throughout the codebase. Environment and Node version management MUST use `fnm`. The AI agent MUST autonomously stage and commit its own changes using `git` upon completing a working task or logical milestone; expecting or instructing the user to run `git add` or `git commit` manually is strictly FORBIDDEN. Commit messages MUST follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.). Commit subject lines MUST be concise (under 50 characters). FORBIDDEN to generate overly verbose or multi-clause commit messages. 

### VI. The "Halt and Catch Fire" Rule
If an AI agent cannot solve a problem without violating the zero-allocation rule, introducing OOP, or breaking the pure-function buffer constraints, it MUST halt, refuse to generate the code, and flag the architectural roadblock for human review. Silently breaking a core principle to force a working solution is strictly FORBIDDEN.

## Governance

This constitution supersedes all other project practices, style guides, and prior conventions. Any conflict between this document and other guidance MUST be resolved in favor of this constitution. Amendments require: (1) a documented rationale for the change, (2) an explicit version bump following semantic versioning, and (3) a migration note for any affected code when applicable. All pull requests and code reviews MUST verify compliance with every Core Principle. Complexity that violates a principle MUST be rejected rather than waived.

**Version**: 1.1.0 | **Ratified**: 2026-10-22 | **Last Amended**: 2026-10-22
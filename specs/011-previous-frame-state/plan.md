# Implementation Plan: Previous Frame State

**Branch**: `011-previous-frame-state` (working on `master`) | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-previous-frame-state/spec.md`

## Summary

Add one pre-allocated `previousFrame: Uint8ClampedArray` to the engine state, sized `width * height`. `createEngine` allocates it zero-filled once. At the end of `tick`, right after `updateBuffer`, the processed frame's bytes are copied into it with a single `previousFrame.set(processed.data)`. Because the copy is the last step, any stage running earlier in the next tick sees the previous tick's final frame. The buffer must be a real copy: `processFrame` reuses `noise.output.data` every tick, so aliasing it would show the current frame, not the previous one. The change touches three existing files in the orchestrator module and adds no files, no consumers, and no hooks.

## Technical Context

**Language/Version**: TypeScript 6 strict, ES2022 (existing)

**Primary Dependencies**: None new

**Storage**: N/A (one extra typed array in `EngineState`)

**Testing**: `vitest` Browser Mode with Playwright Chromium (existing); real buffers and a real renderer, no mocks; unit tests run through `npm test`; the time-sensitive `tick.bench.ts` is excluded from the parallel default pool and run with `npm run test:tick-bench` using `vitest.tick-bench.config.ts` (single worker, no file parallelism). `package.json` owns the script and `vitest.config.ts` excludes this benchmark from the default suite because parallel test load makes its strict 5 ms timing assertion unreliable. The dedicated command is the benchmark's authoritative time and heap gate (Constitution IV).

**Target Platform**: Browser, client-side (unchanged)

**Project Type**: Single project; modifies `src/core/simulation-orchestrator/`

**Performance Goals**: Tick stays under the existing 5 ms benchmark budget for a 512x512 noisy engine (measured about 3.5 ms before this change). The copy moves 262,144 bytes with a native `memcpy`-class `.set`, expected well under 0.1 ms; verified by measurement, not assumed.

**Constraints**: Zero JS allocation in `tick` (the copy passes two existing arrays to `.set`, with no `subarray`, `slice`, or view); `previousFrame` created once and never replaced; `timeMs` still validated before any mutation; no semicolons, `any`, or `@ts-ignore`; no new files in `src/`.

**Scale/Scope**: One extra `width * height` byte buffer per engine. Single-channel 8-bit only.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Data-Oriented Memory | PASS | A flat `Uint8ClampedArray` in the existing plain `EngineState` record; one free-function change in `tick`; allocated once at creation; no class, no per-tick allocation. A plain `ArrayBuffer` backing keeps it transferable to a worker later. |
| II. Pipeline Modularity | PASS | The new buffer is a declared buffer contract (input to stages, written only by `tick`). The copy is the final stage of the sequential pipeline; no processing logic is added. Grayscale, client-side. |
| III. UI Standards | PASS | No Svelte, no DOM. |
| IV. Testing & Benchmarking | PASS | Unit tests with real buffers assert the copy's contents; the existing tick benchmark asserts the time budget and bounded heap growth and covers the hot-loop change. |
| V. Code, Git & Governance | PASS | Strict TS, no semicolons, Conventional Commits, one shell command at a time with the `fnm` prefix. |
| VI. Halt and Catch Fire | PASS | No principle needs breaking. |
| VII. Scope & Simplicity | PASS | One field, one `.set`. No stage registry, no hook points, no history ring, no reset API (see Out of Scope in the spec); stages read `engine.previousFrame` directly. |

Post-design re-check: unchanged, all gates hold.

## Project Structure

### Documentation (this feature)

```text
specs/011-previous-frame-state/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── previous-frame-api.md
```

### Source Code (repository root)

```text
src/core/simulation-orchestrator/
├── types.ts    # EngineState gains previousFrame
├── engine.ts   # createEngine allocates previousFrame
└── tick.ts     # tick copies the final frame into previousFrame

tests/unit/simulation-orchestrator/
├── engine.test.ts   # previousFrame present, sized, zeroed
├── tick.test.ts     # copy contents, ordering, error path
└── tick.bench.ts    # existing budget and heap checks cover the copy

vitest.tick-bench.config.ts # single-worker isolated timing benchmark configuration
```

**Structure Decision**: The engine feature itself adds no source module; it is a field plus one line in the existing hot path. The benchmark uses a dedicated config and package script because running the strict time gate alongside parallel unit tests produces contention-sensitive results.

## Open Flags for Human Review

1. **Nothing reads `previousFrame` yet**: the buffer is stored and guaranteed, but no stage consumes it, so correctness of "accessible to later stages" is verified by tests reading `engine.previousFrame` and by the ordering guarantee (it holds the previous frame until the final copy), not by a real consumer. A future stage that runs after the final copy in the same tick would see the current frame; stages must run inside `tick` before it.
2. **The saved frame is post-noise, post-window/level**: it is the same bytes the renderer receives. An IIR filter on it filters the noisy final output; a filter on the pre-noise composed frame would need a second buffer, which is out of scope.
3. **Order of a tick, not time**: the buffer follows call order. Scrubbing backwards still stores the most recent tick's frame.
4. **Zero-fill at creation**: tick 0 sees an all-zero previous frame, which a stage cannot tell apart from a real black frame. A "has history" flag was not added (speculative, Principle VII); a consumer that needs it can compare against its own counter.
5. **Native cost not measured by heap metrics**: `.set` on a same-type typed array is a native copy with no JS allocation. The heap benchmark proves no JS garbage; the time assertion proves the cost fits the 5 ms budget. Neither proves absence of native allocation, which is not expected here.
6. **Spec directory number**: `.specify/feature.json` previously pointed at a non-existent `specs/011-demos`. It now points at `specs/011-previous-frame-state`; rename or renumber if `011-demos` is still planned.

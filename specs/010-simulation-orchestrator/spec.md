# Feature Specification: Simulation Orchestrator

**Feature Branch**: `010-simulation-orchestrator` (working on `master`; no branch created)

**Created**: 2026-10-25

**Status**: Draft

**Input**: "Start a new feature for the simulation-orchestrator module. Phase 5 of the engine. Build the top-level API surface that coordinates the frame loop: accept a global time, run the temporal and kinematic controllers, fire the compositor, process through the noise controller, and expose the final buffer for rendering. Maintain the strict zero-allocation constraints. (1) Build a top-level engine state that initializes and holds the compositor-core, temporal-controller, kinematic-controller, noise-controller, and headless-renderer. (2) Create a `tick(timeMs)` function that updates temporal weights, updates kinematic spatial offsets, calls `compose()`, runs `processFrame()` for noise/windowing, and outputs to the headless renderer. (3) Maintain strictly zero allocations in the tick loop."

Composes `specs/006-compositor-core`, `specs/007-temporal-controller`, `specs/008-kinematic-controller`, `specs/009-noise-controller`, and `specs/002-headless-renderer`; adds no new pixel math of its own.

## User Scenarios & Testing

### User Story 1 - One Call Per Frame (Priority: P1)

A developer creates an engine of a fixed size, registers layers and motion or weight tracks on the engine's own controller states, then calls `tick(engine, timeMs)` once per animation frame. The frame is composed from the weights and offsets at that time, post-processed, and drawn to the renderer.

**Why this priority**: It is the whole point of the module and works with a single layer and no tracks.

**Independent Test**: Build a small engine with known layers and tracks, tick at known times, and compare the returned buffer and the renderer surface with hand-computed bytes.

**Acceptance Scenarios**:

1. **Given** an engine with one layer and no tracks, **When** `tick(engine, 0)` runs, **Then** the returned image equals that layer after the default (identity) window/level, and `readSurface` shows the same bytes.
2. **Given** a layer with a temporal weight track `0 -> 1` over `0..1000 ms`, **When** `tick(engine, 500)` runs, **Then** the layer contributes at weight `0.5`.
3. **Given** a layer with a kinematic track moving from `x = 0` to `x = 2` over `0..1000 ms`, **When** `tick(engine, 1000)` runs, **Then** the layer is shifted right by two pixels with the vacated columns zero.
4. **Given** one layer with both tracks, **Then** `tick` applies both at the same `timeMs` in one call.
5. **Given** the same engine with noise off, **When** `tick` is called twice with the same `timeMs`, **Then** both frames are identical (time is the only input; no clock is read).
6. **Given** `timeMs` that goes backwards or jumps, **Then** the frame is that time's frame; no state carries between ticks except the noise generator.
7. **Given** a `timeMs` that is not finite, **Then** a `SimulationError` with reason `'invalid-time'` is thrown before anything is mutated.
8. **Given** a window/level or dose set on the engine's noise state, **When** `tick` runs, **Then** the processed frame reflects it.

### User Story 2 - Engine Creation and Teardown (Priority: P1)

A developer creates the engine from one options record (image size, layer and track capacities, optional noise settings, optional viewport) and later destroys it.

**Why this priority**: Nothing else works without a correctly wired engine.

**Independent Test**: Create engines with valid and invalid options; check wiring, dimensions, and error reasons.

**Acceptance Scenarios**:

1. **Given** valid options, **Then** `createEngine` resolves to an engine whose compositor, temporal, kinematic, noise, and renderer states are all present and mutually consistent (the controllers reference the engine's compositor; the noise controller has the compositor's dimensions).
2. **Given** invalid dimensions or capacities, **Then** it rejects with the underlying `CompositorError`, `TemporalError`, or `KinematicError` unchanged, and no renderer resource is left allocated.
3. **Given** invalid noise options or an invalid viewport, **Then** it rejects with the underlying `NoiseError` or `RendererError` unchanged.
4. **Given** a created engine, **When** the developer binds a canvas via the renderer's `bindTarget`, **Then** each `tick` presents the frame on it.
5. **Given** `destroyEngine(engine)`, **Then** the renderer is destroyed; the controller states are plain typed arrays and need no teardown.

### User Story 3 - Zero Allocation Per Tick (Priority: P1)

The frame loop must not generate JS heap garbage, so frame pacing is never disturbed by collection pauses.

**Independent Test**: A benchmark ticks a populated engine repeatedly and asserts bounded heap growth against an allocating control, plus a per-frame time budget.

**Acceptance Scenarios**:

1. **Given** an engine with several layers, temporal and kinematic tracks, and noise on, **When** `tick` is called many times, **Then** JS heap growth stays under the benchmark threshold.
2. **Given** repeated ticks, **Then** the returned `GrayscaleImage` and its `data` are the same instances every time, and no engine field is replaced.

### Edge Cases

- A tick before any layer is registered yields an all-zero frame passed through window/level.
- Tracks registered while the loop is running take effect on the next tick; adding tracks is allocation-permitted (setup path, not the tick).
- The noise generator advances every tick when dose is finite, so frames are not reproducible by time alone; `reseed` restores a sequence.
- Controllers share the engine's compositor by reference; replacing one of the engine's fields is not supported.

## Requirements

- **FR-001**: The module MUST live at `src/core/simulation-orchestrator/`, be DOM-free in its own code (DOM use stays inside the renderer), framework-agnostic, read no clock, and depend only on the five existing core modules.
- **FR-002**: `createEngine(options)` MUST create the compositor, temporal controller, kinematic controller, noise controller, and renderer once and return them in a plain `EngineState` record (no class), with the controllers bound to the same compositor and the noise controller and renderer sized from it.
- **FR-003**: The compositor, temporal controller, kinematic controller, and noise controller MUST be created before the renderer so a synchronous validation failure never leaves a canvas resource allocated.
- **FR-004**: `tick(engine, timeMs)` MUST, in order: validate `timeMs`; run `evaluate` (temporal); run `evaluateMotion` (kinematic); run `compose`; run `processFrame`; run `updateBuffer`; and return the processed `GrayscaleImage`.
- **FR-005**: `tick` MUST allocate nothing: no object, array, closure, iterator, or string creation, no spread, no array methods; it only forwards existing references and a number to the existing zero-allocation functions.
- **FR-006**: `tick` MUST validate `timeMs` before mutating anything, throwing `SimulationError('invalid-time')`; after that check it MUST NOT throw for any engine built by `createEngine`.
- **FR-007**: The engine MUST NOT wrap or re-export the sub-module setup APIs (`registerLayer`, `addTrack`, `addMotionTrack`, `setWindowLevel`, `setDose`, `reseed`, `bindTarget`, `resize`, and so on); callers use them directly on `engine.compositor`, `engine.temporal`, `engine.kinematic`, `engine.noise`, and `engine.renderer`.
- **FR-008**: `destroyEngine(engine)` MUST destroy the renderer and nothing else.
- **FR-009**: Invalid options MUST throw before any resource is allocated; errors from the sub-modules MUST pass through unchanged.

## Success Criteria

- **SC-001**: Unit tests pass in headless Chromium using real buffers and no mocks; all existing tests still pass.
- **SC-002**: End-to-end tests (US1/1 to US1/5) match hand-computed bytes through the renderer surface.
- **SC-003**: A benchmark of a 512x512 engine with four layers, tracks on every layer, and noise on stays within a calibrated per-frame budget and shows less than 100 KB of JS heap growth over repeated ticks.
- **SC-004**: Creating an engine with invalid options never leaves a renderer surface allocated.

## Out of Scope

A clock or animation-frame driver (`requestAnimationFrame` belongs to the UI layer), a timeline or playback model (play, pause, loop, speed), frame-keyed reproducible noise, layer or track management wrappers, per-tick statistics or profiling hooks, resizing an engine (create a new one), worker or `SharedArrayBuffer` transfer, and any UI.

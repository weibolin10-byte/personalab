# AGENTS.md — PersonaLab

## Project overview

PersonaLab is a multi-Agent qualitative-research platform built with Next.js 16, React 19 and TypeScript strict mode. It supports four research methods through two session formats:

- `interview` → `one_on_one`
- `focus_group`, `concept_test`, `ab_compare` → `group`

The application uses a clean chat-based interface. Do not reintroduce the removed pixel court, Canvas stage, sprite renderer or historical language.

## Core architecture

- `/lab` configures projects, goals, stimuli, outlines, participants and Persona turn limits.
- `/session` drives the research one completed message at a time.
- `/personas` manages behavior-oriented Persona profiles.
- `/insights` displays saved sessions and reports.
- `/settings` manages local data and OpenAI-compatible LLM configuration.

Simulation endpoints:

- `POST /api/simulate/decision` returns one next action.
- `POST /api/simulate/turn` streams one message over SSE.
- `POST /api/simulate/analyze` streams analysis progress and a final report.

## Session invariants

1. Never run more than one Agent generation stream at once.
2. Persist every complete `SessionMessage` immediately.
3. Count only Persona messages toward `maxTurns`.
4. Process queued human researcher messages FIFO after the current stream.
5. Human `@` mentions override Agent mentions.
6. Limit consecutive Agent mention chains to three.
7. Avoid consecutive turns by the same Persona unless explicitly addressed.
8. Restore an in-progress session as paused after refresh.
9. Preserve completed messages on retry or early termination.
10. Generate analysis from the completed transcript, including partial sessions.

## Data and persistence

Zustand Persist with key `personalab-storage` is the only persistence layer. There is no database or account system. Store migrations live in `src/lib/store.ts`; update the storage version when persisted shapes change incompatibly.

Important types live in `src/lib/types.ts`:

- `ResearchMode`, `SessionFormat`, `SessionStatus`
- `Persona`, `ResearchProject`, `ResearchConfig`
- `SessionMessage`, `TurnDecision`, `TurnOutput`
- `InsightReport`, `SimulationRecord`

## LLM integration

- Use `src/lib/llm/llm.ts` for all OpenAI-compatible requests.
- `chatJSON` accepts `(config, messages, options)` and requests JSON mode when supported.
- `streamChat` handles streaming deltas and provider differences.
- Validate all model-selected speaker and mention IDs against the current Persona list.
- Keep moderator messages short, open-ended and non-leading.
- Persona prompts should use behavior, values, attitude and communication style.
- Never expose internal scheduling instructions in visible messages.

Mock mode is active when no API key is configured and must support the complete product flow without external requests.

## UI conventions

- Light theme only.
- System sans-serif typography.
- Warm white background, subtle borders and shadows, restrained blue accent.
- Agent messages left; human researcher messages right.
- Stable initial-based avatars.
- Participant panel on desktop, drawer on mobile.
- No animation speed controls or decorative stage visuals.

## Engineering constraints

- Keep TypeScript strict; do not introduce implicit `any`.
- Pages using `useSearchParams` must remain inside `Suspense`.
- Do not write refs during render.
- Use `fetch` plus `ReadableStream.getReader()` for POST SSE.
- Keep all persisted and API data serializable.
- Maintain accessibility for keyboard sending, focus states, labels and mobile layouts.

## Verification

Run before release:

```bash
pnpm ts-check
pnpm lint:build
pnpm lint:style
pnpm build
```

Manually verify Mock mode, both session formats, human intervention, `@` routing, pause/resume, early end, refresh recovery and report generation.

# PersonaLab Design System

## Design direction

PersonaLab is a professional qualitative-research workspace. The interface should feel calm, efficient and trustworthy: warm white surfaces, generous spacing, restrained blue accents and clear information hierarchy.

The product must not use game stages, pixel characters, decorative historical metaphors or animation controls. Conversation and research evidence are the primary visual objects.

## Principles

1. **Research first** — keep the research goal, current topic, progress and participant state visible.
2. **One clear action** — each step should have a dominant next action without competing decoration.
3. **Conversation is evidence** — messages remain readable, attributable and easy to scan.
4. **Progressive disclosure** — advanced context lives in panels or drawers, not in the main flow.
5. **Calm feedback** — streaming, queued questions, pause, errors and analysis use explicit text states.

## Visual language

- Background: warm off-white / cool neutral white.
- Primary text: deep blue-black.
- Secondary text: neutral slate.
- Accent: `#2563eb` blue, used for primary actions, focus and researcher messages.
- Borders: subtle neutral gray, generally 1px.
- Corners: 12–20px depending on component scale.
- Shadows: soft and low contrast; avoid floating-card overload.
- Typography: system sans-serif stack with Chinese platform fonts.
- Avatars: stable soft color plus name initials; no generated character art.

## Main layouts

### Workspace

Compact configuration sequence:

1. Research type
2. Product and research goal
3. Stimulus and outline
4. Participants
5. Persona turn limit
6. Start research

### Session

- Header: research type, topic, Persona progress, pause and end controls.
- Main column: chronological group-chat stream.
- Agent and moderator messages: left aligned.
- Human researcher messages: right aligned in primary blue.
- Composer: fixed at the bottom of the conversation surface.
- Participant panel: right side on desktop, drawer on mobile.
- Only one streaming indicator may be visible at a time.

### Persona library

Use compact cards and a focused editing panel. Emphasize behavioral traits, motivations, attitudes and communication style over demographic decoration.

### Insight report

Use lightweight cards for summary, consensus, controversies, findings, quotes, sentiment, pain points and recommendations. Every quote should remain attributable to a speaker and turn.

## Interaction rules

- Enter sends; Shift + Enter inserts a newline.
- Human questions submitted during generation show a queued state.
- `@` selection clearly identifies who will answer next.
- Pause takes effect at a completed-message boundary.
- Errors retain the existing transcript and expose a retry action.
- Long messages wrap naturally and never overflow their container.
- Focus states must be visible on keyboard navigation.

## Responsive behavior

- Desktop: conversation plus 300px participant panel.
- Tablet: conversation remains primary; secondary controls compact.
- Mobile: participant panel becomes a right drawer; message width expands while preserving speaker identity.

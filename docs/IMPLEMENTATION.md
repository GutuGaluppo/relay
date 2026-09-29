# IMPLEMENTATION.md

# Relay — Implementation Plan

## 1. Goal

Build Relay: a focused cross-device reminder app that lets the user capture an idea on a smartphone and relays it back at the right moment on the desktop.

Core loop:

```text
Capture on phone
→ Sync
→ Desktop reminder
→ Decide
→ Snooze / Start
→ Complete
```

Product rule:

> Relay does not organize the user's life. It prevents a good intention from disappearing.

## Product Identity

Working product name:

```text
Relay
```

Working tagline:

```text
Capture now. Act later.
```

Naming convention for technical identifiers:

```text
relay
relay-mobile
relay-desktop
```

Use `Relay` in user-facing copy and documentation. Avoid coupling database schemas or domain APIs to the brand name when a generic domain term such as `Reminder` is clearer.

---

## 2. MVP Stack

### Mobile
- React Native
- Expo
- TypeScript

### Desktop
- Tauri
- React
- TypeScript

### Backend
- Supabase
- PostgreSQL
- Realtime
- Supabase Auth

### Shared
- pnpm workspace
- Zod
- shared TypeScript types
- shared domain logic

---

## 3. Repository Structure

```text
/apps
  /mobile
  /desktop

/packages
  /domain
  /types
  /sync

/supabase
  /migrations

/docs
```

Do not create a shared UI package for the MVP unless duplication becomes meaningful.

---

# Milestone 0 — Foundation

## Objective

Create the monorepo and make both applications run independently.

## Tasks

- [ ] Create pnpm workspace
- [ ] Create Expo mobile app
- [ ] Create Tauri + React desktop app
- [ ] Enable TypeScript strict mode
- [ ] Configure ESLint
- [ ] Configure Prettier
- [ ] Create shared packages
- [ ] Add environment variable strategy
- [ ] Add basic CI
- [ ] Add README with local setup instructions
- [ ] Set package/app display names to Relay
- [ ] Use `relay-*` naming for app targets/bundle placeholders where appropriate

## Definition of Done

```text
pnpm install
pnpm dev:mobile
pnpm dev:desktop
```

Both applications start successfully.

---

# Milestone 1 — Domain Model

## Objective

Define reminder behavior independently from UI and backend.

## Reminder

```ts
type ReminderStatus =
  | "inbox"
  | "pending"
  | "active"
  | "done"
  | "archived";

type ReminderSource = "text" | "voice";

type Reminder = {
  id: string;
  userId: string;
  text: string;
  source: ReminderSource;
  status: ReminderStatus;

  createdAt: string;
  updatedAt: string;

  nextReminderAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};
```

## Domain Actions

Implement pure functions for:

- [ ] create reminder
- [ ] dismiss initial reminder
- [ ] snooze reminder
- [ ] mark reminder active
- [ ] return active reminder to pending
- [ ] complete reminder
- [ ] archive reminder
- [ ] detect overdue reminder

## Default Rules

```text
Initial "Agora não"
→ +2 hours

"Ainda não"
→ +90 minutes
```

Custom snooze:

```text
30 minutes
1 hour
2 hours
Tomorrow
Custom time
```

## Important Rule

Never use an in-memory timer as the source of truth.

Persist:

```text
nextReminderAt
```

## Tests

- [ ] transitions between statuses
- [ ] default snooze calculations
- [ ] custom snooze calculations
- [ ] overdue reminder detection
- [ ] invalid transitions
- [ ] timezone-safe timestamps

## Definition of Done

All reminder lifecycle rules work without React, Tauri, Expo, or Supabase.

---

# Milestone 2 — Supabase + Authentication

## Objective

Allow the same user to access reminders from multiple devices.

## Tasks

- [ ] Create Supabase project
- [ ] Create `reminders` table
- [ ] Add database migration
- [ ] Enable Row Level Security
- [ ] Add user ownership policies
- [ ] Configure authentication
- [ ] Implement session persistence
- [ ] Create typed Supabase client

Initial authentication options:

- Apple
- Google
- magic link

Implement the simplest production-safe option first.

## Database Fields

```text
id
user_id
text
source
status
created_at
updated_at
next_reminder_at
started_at
completed_at
```

## Definition of Done

A user can log in on mobile and desktop and only access their own reminders.

---

# Milestone 3 — Mobile Capture

## Objective

Make capturing an idea take only a few seconds.

## Screen

```text
What do you want to remember?

[ Write something... ]

[ Speak ]

                    [ Send ]
```

## Tasks

### Text

- [ ] text input
- [ ] send action
- [ ] loading state
- [ ] subtle success confirmation
- [ ] clear input after successful capture

### Offline

- [ ] persist unsent reminders locally
- [ ] retry automatically when connection returns
- [ ] prevent duplicate submissions

### Voice

- [ ] microphone permission
- [ ] speech-to-text
- [ ] show transcript before sending
- [ ] allow transcript editing
- [ ] do not permanently retain raw audio

## UX Rule

Do not add:

- projects
- tags
- priorities
- due dates
- categories

## Definition of Done

The user can capture an idea through text or voice and see it synchronized to the backend.

---

# Milestone 4 — Desktop Shell

## Objective

Make the desktop application behave like a background utility.

## Tasks

- [ ] create main desktop window
- [ ] implement menu bar / system tray
- [ ] closing window keeps app running
- [ ] explicit Quit terminates application
- [ ] reopen window from tray
- [ ] support launch at system login
- [ ] persist desktop settings locally

## Tray Menu

Initial menu:

```text
Open
Pending reminders
Settings
Quit
```

Keep it minimal.

## Platform Priority

Build and validate macOS first.

Keep architecture compatible with Windows support later.

## Definition of Done

Closing the desktop window does not stop synchronization or reminder scheduling.

---

# Milestone 5 — Sync Engine

## Objective

Keep mobile, cloud, and desktop state consistent.

## Flow

```text
Mobile creates reminder
→ local state
→ cloud
→ realtime event
→ desktop
→ local desktop state
```

## Tasks

- [ ] subscribe to Supabase Realtime
- [ ] fetch current reminders on startup
- [ ] store relevant reminders locally
- [ ] reconcile local and server state
- [ ] sync after resume from sleep
- [ ] sync after reconnect
- [ ] handle duplicate events safely
- [ ] handle stale local data
- [ ] add sync error logging

## Sync Rule

Realtime improves responsiveness.

It must not be the only synchronization mechanism.

Always reconcile with server state after important lifecycle events.

## Definition of Done

A reminder created on the phone appears on the desktop without requiring an app restart.

---

# Milestone 6 — Reminder Engine

## Objective

Reliably decide when a reminder should appear.

## Trigger Events

Evaluate pending reminders when:

- [ ] desktop app starts
- [ ] user logs in
- [ ] computer unlocks
- [ ] computer wakes from sleep
- [ ] sync completes
- [ ] periodic scheduler runs

## Rules

Show a reminder when:

```text
status == pending
AND
nextReminderAt <= now
```

New synced reminders without `nextReminderAt` should be eligible for the next intentional reminder moment.

## Important

Do not rely solely on:

```ts
setTimeout(...)
```

Timers may be used as an optimization only.

Persistent timestamps determine actual reminder state.

## Multiple Reminders

If several reminders are due:

```text
oldest due reminder first
```

Do not stack multiple modals.

Process one at a time.

## Definition of Done

Reminders survive:

- app restart
- system restart
- sleep
- temporary network loss

---

# Milestone 7 — Reminder UI

## Objective

Create the primary desktop interaction.

## Initial Reminder

```text
Prepare the proposal.

[ Agora não ]        [ Farei agora ]
```

### Agora não

```text
status → pending
nextReminderAt → now + 2 hours
```

### Farei agora

```text
status → active
startedAt → now
```

Then open Focus Mode.

---

## Follow-up Reminder

```text
Prepare the proposal.

[ Prorrogar ] [ Iniciar tarefa ] [ Ainda não ]
```

### Prorrogar

Options:

```text
30 min
1 hour
2 hours
Tomorrow
Choose time
```

### Ainda não

```text
nextReminderAt → now + 90 minutes
```

### Iniciar tarefa

```text
status → active
startedAt → now
```

## UX Requirements

- one task only
- minimal text
- strong typography
- very little visual noise
- keyboard accessible
- clear focus states
- no aggressive warning colors

## Definition of Done

All reminder actions correctly update local and cloud state.

---

# Milestone 8 — Focus Mode

## Objective

Give the user a clear transition from intention to action.

## Initial UI

```text
Prepare the proposal.

             00:24:18

[ Adiar ]                  [ Concluir ]
```

Timer represents elapsed time.

## Actions

### Concluir

```text
status → done
completedAt → now
```

### Adiar

Return reminder to pending and request a snooze duration.

## Tasks

- [ ] elapsed timer
- [ ] complete action
- [ ] postpone action
- [ ] restore active task after restart
- [ ] sync active state between devices

## Non-goals

Do not add yet:

- Pomodoro
- checklist
- website blocking
- app blocking
- productivity scores
- AI assistance

## Definition of Done

An active task can survive an application restart and be completed reliably.

---

# Milestone 9 — Inbox + History

## Objective

Provide basic visibility without turning the app into a task manager.

## Inbox

Show:

- pending reminders
- active reminder

Allow:

- open
- archive

Avoid complex organization.

## History

Show:

- recently completed
- archived

Possible actions:

- restore
- permanently remove later

## Definition of Done

The user can understand what is pending and recover accidentally archived items.

---

# Milestone 10 — Settings

## MVP Settings

Only include settings that materially affect behavior.

- [ ] launch at login
- [ ] notifications enabled
- [ ] default initial delay
- [ ] default "Ainda não" delay
- [ ] elapsed timer on/off
- [ ] sign out

Avoid a large settings surface.

---

# Milestone 11 — Reliability Pass

## Objective

Treat interruptions as normal, not exceptional.

Test:

- [ ] phone offline during capture
- [ ] desktop offline
- [ ] duplicate submission
- [ ] duplicate realtime event
- [ ] app killed during sync
- [ ] desktop sleeps during countdown
- [ ] desktop wakes after reminder is overdue
- [ ] user signs out
- [ ] user changes timezone
- [ ] system clock changes
- [ ] two desktop devices are logged in
- [ ] active reminder completed from another device

Prefer deterministic behavior over clever automation.

---

# Milestone 12 — Visual Polish

## Direction

Relay should feel:

```text
sober
intelligent
calm
precise
quiet
```

## UI

Product copy should consistently use the name `Relay`. Keep the tone concise and action-oriented.

- restrained palette
- strong typography
- generous whitespace
- subtle motion
- minimal chrome
- no dashboard aesthetic
- no gamification

## Icon

Create:

1. full application icon
2. macOS menu bar glyph
3. Windows tray glyph

The tray version must be designed separately rather than being a scaled-down app icon.

---

# Milestone 13 — Beta

## Internal Beta Checklist

- [ ] production Supabase environment
- [ ] crash/error reporting
- [ ] privacy policy
- [ ] authentication recovery
- [ ] migration strategy
- [ ] database backups
- [ ] macOS signing
- [ ] macOS notarization
- [ ] mobile build distribution
- [ ] telemetry decision documented

Prefer no behavioral analytics in the first private beta unless genuinely needed.

---

# Architecture Boundaries

Keep these concerns separated:

```text
UI
↓
Application layer
↓
Domain
↓
Repositories / services
↓
Local + Cloud persistence
```

React components must not own business rules for reminder scheduling.

Example:

```ts
// Good
const updatedReminder = snoozeReminder(reminder, duration);

// Avoid
setNextReminderAt(
  new Date(Date.now() + 90 * 60 * 1000)
);
```

Domain rules belong in `/packages/domain`.

---

# Suggested Shared Modules

```text
/packages/domain
  reminder.ts
  reminder-actions.ts
  reminder-scheduler.ts

/packages/types
  reminder.ts
  api.ts

/packages/sync
  sync-engine.ts
  reconciliation.ts
```

---

# Testing Strategy

## Unit

Focus heavily on:

- reminder state transitions
- snooze logic
- timestamp handling
- reconciliation logic

## Integration

Test:

```text
Create mobile reminder
→ backend
→ desktop sync
→ reminder due
→ snooze
→ backend update
```

## End-to-End

Cover only core product flows initially.

### Flow A

```text
Capture
→ desktop reminder
→ Agora não
→ reminder returns
```

### Flow B

```text
Capture
→ Farei agora
→ Focus Mode
→ Concluir
```

### Flow C

```text
Capture offline
→ reconnect
→ sync
→ desktop receives reminder
```

---

# MVP Completion Criteria

Relay's MVP is complete when a user can reliably:

1. log in on phone and computer;
2. capture a reminder through text;
3. capture one through voice;
4. receive it on the desktop;
5. dismiss it for 2 hours;
6. receive the reminder again;
7. snooze it;
8. start working on it;
9. mark it complete;
10. restart the computer without losing reminder state.

Anything beyond this is secondary.

---

# Post-MVP Ideas

Do not implement until the MVP is stable.

Possible exploration:

- associated URL
- open associated application
- small checklist
- calendar integration
- contextual reminder timing
- Pomodoro mode
- natural-language snooze
- desktop quick capture
- share sheet on mobile
- widgets
- Siri / Shortcuts integration
- Android quick settings capture

Every future feature must answer:

> Does this help the user capture an intention or act on it?

If the answer is unclear, leave it out.

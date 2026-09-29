# Relay — Base Development Prompt

You are developing **Relay**, a focused cross-device reminder application that connects a smartphone with a desktop computer.

Relay is not a traditional task manager.

Its core purpose is:

> Capture an intention quickly on the phone and relay it back to the user when they return to their computer.

Working tagline:

> **Capture now. Act later.**

Prioritize simplicity, reliability, low cognitive load, and deliberate interaction.

---

# 1. Product Principle

Relay exists to prevent good intentions from disappearing.

It should not try to organize the user's entire life.

Before adding any feature, ask:

> Does this make capturing an intention or acting on it easier?

If not, it probably does not belong in Relay's core product.

---

# 2. Core Product Flow

```text
Smartphone
↓
Capture idea/task
↓
Cloud sync
↓
Relay Desktop receives item
↓
User logs in / unlocks computer
↓
Prominent reminder
↓
User makes a decision
```

The user should be able to capture something on the smartphone in just a few seconds.

Supported capture methods:

- text
- voice-to-text

Do not require:

- project selection
- tags
- categories
- due dates
- priority
- complex metadata

Capture first. Organization is secondary.

---

# 3. Mobile App

Relay Mobile should behave like a capture utility, not a task manager.

Primary screen:

```text
What do you want to remember?

[ Write something... ]

[ 🎙 Speak ]

                [ Send ]
```

After submission:

- save locally if necessary
- sync to cloud
- show subtle confirmation
- clear the input
- immediately return to capture mode

Avoid dashboards, complex navigation, and productivity metrics.

---

# 4. Desktop Application

Relay Desktop runs continuously in the background.

Closing the main window must NOT terminate Relay.

Expected behavior:

```text
Close Window
→ Relay remains running

Quit
→ Relay terminates
```

Support:

- launch at system login
- menu bar / system tray presence
- background synchronization
- background reminder scheduling
- notifications
- offline-safe local persistence

The desktop app is Relay's main decision environment.

---

# 5. Initial Reminder

When the user logs in or unlocks the computer and pending items exist, show the reminder prominently.

Prefer a focused full-screen overlay or large modal.

Example:

```text
Prepare the proposal for Daniela.

[ Agora não ]        [ Farei agora ]
```

Portuguese should be the initial product language.

### Agora não

- close the reminder
- keep the item pending
- schedule the next reminder for 2 hours later

### Farei agora

- mark the item as active
- open Focus Mode

---

# 6. Follow-up Reminder

When the reminder returns:

```text
Prepare the proposal for Daniela.

[ Prorrogar ] [ Iniciar tarefa ] [ Ainda não ]
```

### Prorrogar

Initial options:

- 30 minutes
- 1 hour
- 2 hours
- Tomorrow
- Choose time

### Ainda não

Close the reminder and schedule it again for:

```text
90 minutes
```

### Iniciar tarefa

Open Focus Mode.

---

# 7. Focus Mode

Keep Focus Mode intentionally simple.

```text
Prepare the proposal for Daniela.

            00:24:18

[ Adiar ]                    [ Concluir ]
```

The timer represents elapsed time, not a countdown.

Its purpose is only to create the transition:

```text
Pending
→ Active
→ Completed
```

Possible future additions:

- Pomodoro
- associated URL
- open associated application
- small checklist
- calendar integration
- tracked work duration

Do NOT implement them unless explicitly requested.

---

# 8. Task Lifecycle

```text
INBOX
↓
PENDING
↓
ACTIVE
↓
DONE
```

Alternative exits:

```text
PENDING → ARCHIVED
ACTIVE → PENDING
```

Suggested statuses:

```ts
type ReminderStatus =
  | "inbox"
  | "pending"
  | "active"
  | "done"
  | "archived";
```

---

# 9. Reminder Data Model

Start with a minimal model.

```ts
type Reminder = {
  id: string;
  userId: string;
  text: string;
  source: "text" | "voice";

  status:
    | "inbox"
    | "pending"
    | "active"
    | "done"
    | "archived";

  createdAt: string;
  updatedAt: string;

  nextReminderAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};
```

Add fields only when they solve an actual product requirement.

---

# 10. Suggested Technology Stack

## Mobile

```text
React Native
Expo
TypeScript
```

## Desktop

```text
Tauri
React
TypeScript
```

## Backend

```text
Supabase
PostgreSQL
Realtime
Supabase Auth
```

## Shared

```text
pnpm workspace
Zod
shared TypeScript types
shared domain logic
```

Use generic domain names such as `Reminder` in APIs and schemas. Do not unnecessarily couple domain logic to the Relay brand name.

---

# 11. Synchronization

Synchronization is a critical feature.

```text
Relay Mobile creates reminder
↓
Cloud receives reminder
↓
Relay Desktop receives update
↓
Local desktop state updates
```

Prefer realtime synchronization when available.

Also implement periodic reconciliation so Relay does not depend entirely on realtime events.

Design synchronization to tolerate:

- temporary internet loss
- app restart
- computer sleep
- phone offline
- duplicate network requests

Operations should be idempotent where practical.

---

# 12. Authentication

Authentication must be simple.

Initial possibilities:

- Apple
- Google
- email magic link

The user should rarely encounter authentication screens after initial setup.

Persist sessions securely.

---

# 13. Voice Capture

```text
Tap microphone
↓
Record
↓
Speech-to-text
↓
Show transcription
↓
User can edit
↓
Send
```

Prefer native/on-device speech recognition when appropriate.

Cloud transcription may be added later if quality requires it.

Never permanently store raw audio unless Relay explicitly introduces that feature.

---

# 14. Background Behavior

Relay Desktop should behave like a system utility.

Requirements:

- starts automatically if enabled
- remains active after window close
- menu bar/system tray icon remains available
- reminders continue while the main window is closed
- sync continues in the background
- explicit Quit terminates the application

Initial tray/menu bar menu:

```text
Open Relay
Pending reminders
Settings
Quit Relay
```

Keep it minimal.

---

# 15. Multiple Pending Reminders

Never overwhelm the user with simultaneous reminders.

If several reminders are due:

```text
oldest due reminder first
```

Show one at a time.

Do not create an aggressive cascade of popups.

---

# 16. Product Personality

Relay should feel:

- sober
- intelligent
- calm
- concise
- dependable
- slightly assertive
- never stressful

It should NOT feel:

- gamified
- childish
- hyper-productive
- corporate
- noisy
- motivational
- judgmental

Avoid language such as:

```text
You are behind!
You missed this!
Don't forget again!
You have 8 tasks pending!
```

Prefer neutral, direct language.

---

# 17. Design Principles

Use very little content on screen.

Characteristics:

- strong typography
- generous whitespace
- restrained palette
- subtle transitions
- clear hierarchy
- almost no decorative UI
- high contrast where needed
- immediate readability

Avoid unnecessary:

- cards
- badges
- charts
- gradients
- productivity scores
- colorful status systems
- navigation complexity

Each screen should ideally have one clear purpose.

---

# 18. Relay Icon

Main app icon:

- solid color
- one simple symbol
- strong silhouette
- recognizable at small sizes
- no text
- no complex illustration

The visual metaphor may explore the idea of:

- relay
- transfer
- passing forward
- return
- handoff
- signal

Do not force a literal interpretation.

Create separate optimized versions for:

```text
macOS menu bar
Windows system tray
```

Tray/menu bar variants should work as simple monochrome glyphs.

Do not simply shrink the full application icon.

---

# 19. Notifications vs Modal

Use native notifications for secondary reminders when appropriate.

Use the large reminder interface only for moments that intentionally require a decision.

Avoid excessive full-screen interruption.

Initial login/unlock reminders may be prominent.

Later reminders should balance visibility with respect for the user's current activity.

---

# 20. Snooze Logic

Default behavior:

```text
Initial dismissal
→ 2 hours

Still not
→ 90 minutes
```

Custom postponement:

```text
30 min
1 hour
2 hours
Tomorrow
Custom time
```

All reminder calculations must use absolute timestamps internally.

The reminder must survive:

- application restart
- system restart
- sleep
- logout/login

---

# 21. Persistence Rule

Never rely on:

```ts
setTimeout(...)
```

as the sole reminder mechanism.

Persist:

```text
nextReminderAt
```

Then evaluate overdue reminders whenever:

- app starts
- computer unlocks
- app resumes from sleep
- synchronization occurs
- periodic scheduler runs

---

# 22. MVP Scope

## Relay Mobile

- authentication
- text capture
- voice-to-text capture
- sync

## Relay Desktop

- authentication
- cloud synchronization
- local persistence
- startup at login
- menu bar/system tray
- initial reminder
- snooze logic
- Focus Mode
- completion
- archived/completed history

No advanced analytics.

No projects.

No labels.

No AI assistant.

No complex settings.

---

# 23. Code Quality

Prioritize:

- clear architecture
- TypeScript strict mode
- small components
- predictable state
- explicit domain logic
- reusable services
- good error handling
- testable reminder logic

Separate:

```text
UI
domain logic
persistence
sync
system integrations
```

Avoid embedding reminder scheduling logic directly inside React components.

---

# 24. Suggested Project Structure

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

Suggested project identifiers:

```text
relay
relay-mobile
relay-desktop
```

Share:

- types
- validation schemas
- domain rules
- sync models

Do not share platform-specific UI unnecessarily.

---

# 25. Development Rule

When implementing any feature:

1. identify the user interaction
2. define domain behavior
3. define persistence requirements
4. account for offline/restart behavior
5. implement UI
6. test edge cases

Prioritize reliability over visual complexity.

---

# Relay North Star

Always preserve this principle:

> **Relay does not organize the user's life. It prevents a good intention from disappearing.**

And the working promise:

> **Capture now. Act later.**

Every product, UX, architecture, and feature decision should reinforce these principles.

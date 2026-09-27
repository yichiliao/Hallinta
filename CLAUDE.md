# Hallinta

Hallinta is a local-first, AI-native research project management tool for academic research groups.

The core idea is simple:

> **A research project is a collection of living Markdown documents. The UI provides a structured view over those documents. Hallinta helps maintain them.**

Hallinta is designed around the way academic research actually evolves. Research projects do not follow a fixed sequence of tickets. Questions change, hypotheses evolve, experiments fail, framing shifts, and new tasks emerge from meetings and results.

The goal is to maintain a lightweight, shared representation of:

- What is this project?
- Where are we now?
- What are we working on?
- What have we finished?
- What should happen next?
- Why are we doing these things?
- What decisions have we made?
- What remains unresolved?

The experience should feel like:

> **A beautifully rendered research README that stays alive throughout the project.**

---

# Working on This Repository

This file is the product spec. Sections 1–30 are the original V0 design (now built); §31–32 record what came after, including solo and team modes. The README covers setup.

- `npm test`, `npm run typecheck`, and `npm run build` must pass before committing. Add tests for new logic; tests use temporary copies of `examples/`, never real data.
- Every page, server action, and API route must call a guard from `src/lib/auth/guard.ts` (§32.6). `tests/guard-coverage.test.ts` enforces this; public auth endpoints are listed there with a reason.
- Project content is only read and written through `ProjectStore` (§22). Hallinta's AI never writes files: it proposes changes, and the user accepts them (§12, §14).
- `data/` holds real research content and is git-ignored. Examples and fixtures live in `examples/` and must stay fictional.

---

# 1. Product Principles

## 1.1 Markdown is the source of truth

All substantive project information is stored in Markdown files.

Do not introduce a database for project content in V0.

The UI should read from and write to these Markdown files.

Each major project section must have its **own Markdown file**.

Example:

```text
data/
└── heat-islands/
    ├── project.json
    ├── description.md
    ├── status.md
    ├── papers.md
    ├── resources.md
    ├── related-projects.md
    ├── artifacts.md
    ├── todos.md
    ├── timeline.md
    └── meetings/
        ├── 2026-09-13.md
        ├── 2026-09-20.md
        └── 2026-09-27.md
```

`project.json` is the only exception. It contains minimal application metadata such as:

```json
{
  "id": "heat-islands",
  "name": "Urban Heat Islands",
  "members": ["Ana Rivera", "Mina Park"],
  "created": "2026-09-01"
}
```

Research content should remain in Markdown.

---

## 1.2 One shared project view

PI and students should see the same project interface.

Do not build separate PI and student dashboards.

The philosophy is:

> **One project. One shared view. Everyone knows where the research stands, why things are being done, and what everyone is working on.**

In team mode (§32), access decides *which* projects a person can see or edit, but everyone who can see a project sees the same view of it. Permissions filter; they never fork the representation.

---

## 1.3 Manual editing must always be available

Every main section must be manually editable.

The normal state of a section is a nicely rendered Markdown view.

Each section has an **Edit** button.

Clicking Edit changes only that section into a Markdown editor.

Example:

```text
CURRENT STATUS                                  Edit
─────────────────────────────────────────────────────

Sensor data from the Riverside district is complete
for July and August.

## Open Questions

- Does the model transfer to the Harbor district?
- Do we still need the drone survey?
```

After clicking Edit:

```text
CURRENT STATUS                         Cancel   Save
─────────────────────────────────────────────────────

┌───────────────────────────────────────────────────┐
│ Sensor data from the Riverside district is       │
│ complete for July and August.                    │
│                                                  │
│ ## Open Questions                                │
│                                                  │
│ - Does the model transfer to the Harbor...       │
│ - Do we still need the drone survey?             │
└───────────────────────────────────────────────────┘
```

Saving writes directly to the corresponding Markdown file.

Cancel restores the rendered version without modifying the file.

Manual editing should work even if no AI API is configured.

---

# 2. Project Page

The main project page is a continuous research project document.

Sections appear in this order:

1. Project Description
2. Current Status
3. Related Papers
4. Useful Links & Resources
5. Related Projects
6. Artifacts
7. Todos
8. Timeline
9. Meeting Notes

The page should prioritize readability over dashboard density.

It should feel more like a living research document than Jira.

---

# 3. Project Description

Backed by:

```text
description.md
```

Contains the relatively stable high-level description of the project.

Possible content:

- research problem
- motivation
- core idea
- research questions
- hypotheses
- intended contribution

This section is free-form Markdown.

It should not be forced into structured fields.

---

# 4. Current Status

Backed by:

```text
status.md
```

This is one of the most important sections.

It answers:

> **Where is the project right now?**

Possible content:

- current stage
- latest findings
- active questions
- blockers
- current framing
- important recent changes

This should remain concise enough that someone can read it quickly before a meeting.

---

# 5. Related Papers

Backed by:

```text
papers.md
```

Keep this deliberately free-form.

Users may write:

```markdown
## Core Papers

- [Satellite temperature downscaling paper](...)
  - Main baseline.
  - Trained on daytime data only; weak at night.

- [Low-cost sensor networks paper](...)
  - Provides the calibration procedure.

## Possibly Relevant

- [A survey of urban heat mitigation](...)
```

Do not require structured bibliographic metadata in V0.

---

# 6. Useful Links & Resources

Backed by:

```text
resources.md
```

Examples:

```markdown
## Code

- [Sensor firmware](...)
- [Downscaling model](...)

## Data

- Sensor readings
- Satellite tiles

## Documents

- Paper draft
- Overleaf
```

Again, keep this free-form.

---

# 7. Related Projects

Backed by:

```text
related-projects.md
```

This section links projects within Hallinta.

Example:

```markdown
## Related Projects

- [[Open Sensor Kit]]
  - Provides the sensor hardware and data pipeline.

- [[Cooling Policy Study]]
  - Uses our heat maps to evaluate city cooling programs.
```

When rendered, internal project references such as `[[Open Sensor Kit]]` should be clickable and navigate to that project.

---

# 8. Artifacts

Backed by:

```text
artifacts.md
```

Use two subsections:

```markdown
## Ongoing

### Figure 2 — Night-time Heat Map

Current state:
- Riverside complete
- Harbor partially complete
- Drone validation missing

### Paper Draft

Current state:
- Introduction stable
- Results being updated

## Finished

### Sensor Calibration Table

Completed September 20.

### Field Deployment Video

Completed September 22.
```

Artifacts represent meaningful research outputs.

Examples:

- figures
- tables
- experiment results
- implementations
- datasets
- videos
- prototypes
- paper sections
- submissions

Do not model every small task as an artifact.

---

# 9. Todos

Backed by:

```text
todos.md
```

Use standard Markdown checkboxes.

Example:

```markdown
## Fieldwork

- [ ] Calibrate the second batch of sensors
- [x] Deploy sensors in the Riverside district

## Analysis

- [ ] Update Figure 2
- [ ] Write up the night-time result

## Release

- [ ] Publish the cleaned dataset
```

The rendered UI should provide a convenient way to toggle checkbox state.

The user must also be able to edit the entire section as Markdown.

---

# 10. Timeline

Backed by:

```text
timeline.md
```

The timeline contains important project events and milestones.

It includes both past and future events.

Example:

```markdown
## September 2026

- Sep 10 — First full month of sensor data
- Sep 20 — Model beats the satellite baseline
- Sep 27 — Decided to refocus the paper on night-time heat

## October 2026

- Oct 5 — Transfer results for a second district
- Oct 15 — Internal paper deadline
- Oct 30 — Submission
```

Do not put every todo into the timeline.

Timeline entries should represent meaningful events.

---

# 11. Meeting Notes

Meeting notes live in:

```text
meetings/
```

Each meeting is its own Markdown file.

Example:

```text
meetings/2026-09-27.md
```

Recommended structure:

```markdown
# Weekly Meeting — 2026-09-27

## Updates

- Riverside sensor data complete for July and August.
- First Harbor sensors online.

## Discussion

We discussed whether the paper should lead with the
downscaling model or with what it reveals about night-time heat.

## Decisions

- Lead with the block-level characterization of night-time heat.
- Keep the downscaling model as the method.

## Todos

- [ ] Run the Harbor transfer experiment
- [ ] Update Figure 2
- [ ] Rewrite introduction

## Open Questions

- Is the drone survey necessary?
- Do we need a third district?
```

Users must be able to:

- create a meeting note
- view meeting notes
- edit meeting notes
- delete meeting notes

Meeting notes are especially important inputs to Hallinta.

---

# 12. Hallinta

Hallinta is the AI layer over the shared Markdown project representation.

Hallinta is **not an autonomous project manager**.

Hallinta should primarily:

> **Read → understand → propose.**

Humans remain responsible for deciding what becomes part of the official project state.

The central distinction is:

> **Markdown = agreed project state.**

> **Hallinta suggestions ≠ project state.**

---

# 13. Ask Hallinta

The main AI interaction should be accessible through a prominent input:

```text
Ask Hallinta...
```

Users can ask natural-language questions about the project.

Examples:

```text
Where are we?
```

```text
Why are we running the drone survey?
```

```text
What changed during the last two meetings?
```

```text
What is still blocking the paper?
```

```text
What should we discuss in the next meeting?
```

```text
When did we change the framing?
```

```text
What is Mina working on?
```

Hallinta should answer using the project's Markdown documents.

Whenever practical, answers should indicate which project documents or meeting notes support the answer.

For V0, do not build RAG or embeddings.

Projects are small enough that relevant Markdown files can simply be passed to the model.

---

# 14. Updating Projects with Hallinta

Users should also be able to describe something that happened.

Examples:

```text
Figure 2 is finished.
```

```text
We decided to drop the drone survey.
```

```text
Update the project based on today's meeting.
```

Hallinta determines which Markdown documents may need modification.

However:

> **Hallinta must never silently modify project files.**

The flow is:

```text
User instruction
      ↓
Hallinta reads project
      ↓
Hallinta proposes modifications
      ↓
Show affected files
      ↓
Show diff
      ↓
User accepts / edits / rejects
      ↓
Write approved changes
```

For example:

```text
You: Update the project based on today's meeting.

Hallinta proposes 4 changes:

status.md
+ Riverside data is complete.
+ Transfer to the Harbor district remains untested.

artifacts.md
+ Figure 2 moved to Ongoing.

todos.md
+ [ ] Run the Harbor transfer experiment
+ [ ] Update Figure 2

timeline.md
+ Sep 27 — Refocused the paper on night-time heat.

[Review changes]
```

The user should then see a readable diff.

Only after explicit approval should the files be modified.

---

# 15. Hallinta Suggestions

Hallinta may proactively identify useful next actions.

Provide a small section such as:

```text
HALLINTA SUGGESTS
```

Suggestions should be grounded in actual project context.

Example:

```text
Run the Harbor transfer experiment

The Sep 27 meeting left unresolved whether the model
trained in Riverside works in another district.

[Add to Todos]   [Discuss]   [Dismiss]
```

Another example:

```text
Update Figure 2

The latest Harbor results are newer than the results
currently described in the artifact.

[Add to Todos]   [Discuss]   [Dismiss]
```

Avoid generic AI suggestions such as:

- read more papers
- analyze the results
- improve the writing
- run more experiments
- think about the contribution

Every suggestion should answer:

> **Why is Hallinta suggesting this?**

---

# 16. Suggested Support

Hallinta may also identify resources that could help.

Examples:

```text
RELATED SUPPORT

Open Sensor Kit may contain a reusable calibration script.

Why:
The current project needs to calibrate a new sensor batch,
and Open Sensor Kit already contains the latest calibration code.

[Open Project]
```

Possible support includes:

- related papers
- related internal projects
- reusable implementations
- datasets
- analysis techniques
- relevant previous experiments
- unresolved questions from previous meetings

Cross-project reasoning is desirable but not necessary for the earliest V0.

---

# 17. Project Consistency Review

Hallinta can inspect the project representation for inconsistencies.

Examples:

- Current Status appears stale relative to recent meetings.
- A finished artifact still has unfinished todos.
- An artifact has no corresponding tasks.
- A deadline is approaching with unfinished artifacts.
- A meeting decision contradicts Current Status.
- The same unresolved question has appeared in multiple meetings.
- A completed experiment has not been reflected in the paper status.

Present these as observations or suggestions.

Do not automatically resolve them.

---

# 18. Editing Model

There are two first-class ways to change project state.

## Manual

```text
Edit
  ↓
Markdown editor
  ↓
Save
```

## Hallinta-assisted

```text
Ask Hallinta
  ↓
Describe change
  ↓
Hallinta proposes Markdown edits
  ↓
Diff
  ↓
Accept
```

Both paths ultimately modify the same Markdown files.

AI is an enhancement, not a requirement for basic project management.

---

# 19. UI Direction

Use a clean, restrained research-tool aesthetic.

Avoid making Hallinta look like:

- Jira
- a corporate analytics dashboard
- a generic chatbot
- a complex knowledge graph

The main project page should feel calm and document-oriented.

Possible structure:

```text
┌───────────────────────────────────────────────────────────┐
│ Urban Heat Islands                           Ask Hallinta...  │
│ Ana Rivera · Mina Park                                    │
├───────────────────────────────────────────────────────────┤
│                                                           │
│ PROJECT DESCRIPTION                                Edit   │
│                                                           │
│ ...                                                       │
│                                                           │
├───────────────────────────────────────────────────────────┤
│ CURRENT STATUS                                     Edit   │
│                                                           │
│ ...                                                       │
│                                                           │
├───────────────────────────────────────────────────────────┤
│ RELATED PAPERS            USEFUL RESOURCES                 │
│ ...                       ...                              │
├───────────────────────────────────────────────────────────┤
│ RELATED PROJECTS                                   Edit   │
│ ...                                                       │
├───────────────────────────────────────────────────────────┤
│ ARTIFACTS                                          Edit   │
│                                                           │
│ Ongoing                    Finished                       │
│ ...                        ...                            │
├───────────────────────────────────────────────────────────┤
│ TODOS                                              Edit   │
│ ...                                                       │
├───────────────────────────────────────────────────────────┤
│ TIMELINE                                           Edit   │
│ ...                                                       │
├───────────────────────────────────────────────────────────┤
│ MEETING NOTES                                             │
│                                                           │
│ Sep 27 — Weekly Meeting                                   │
│ Sep 20 — Weekly Meeting                                   │
│ Sep 13 — Weekly Meeting                                   │
│                                                           │
│ + New Meeting                                             │
└───────────────────────────────────────────────────────────┘
```

Cards or subtle section boundaries are fine.

Avoid excessive visual chrome.

---

# 20. Technical Stack

Use:

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- react-markdown
- remark-gfm
- CodeMirror 6 or another maintained Markdown editor
- Lucide icons

Use either Anthropic or OpenAI for AI functionality.

Keep the AI provider behind a simple abstraction so it can be changed later.

---

# 21. Architecture

For V0:

```text
Browser
   ↕
Next.js
   ├── React UI
   ├── server-side file operations
   └── AI API
          ↕
Local Markdown files
```

Do not create a separate backend service.

Next.js server-side routes/actions can handle:

1. filesystem operations
2. AI API calls

API keys must remain server-side.

---

# 22. Storage Abstraction

The UI must never directly access the filesystem.

Create a storage abstraction.

Example:

```typescript
interface ProjectStore {
  listProjects(): Promise<ProjectSummary[]>;

  getProject(projectId: string): Promise<Project>;

  readDocument(
    projectId: string,
    documentId: string
  ): Promise<string>;

  writeDocument(
    projectId: string,
    documentId: string,
    content: string
  ): Promise<void>;

  listMeetings(
    projectId: string
  ): Promise<MeetingSummary[]>;

  readMeeting(
    projectId: string,
    meetingId: string
  ): Promise<string>;

  createMeeting(
    projectId: string,
    meetingId: string,
    content: string
  ): Promise<void>;

  updateMeeting(
    projectId: string,
    meetingId: string,
    content: string
  ): Promise<void>;

  deleteMeeting(
    projectId: string,
    meetingId: string
  ): Promise<void>;
}
```

For V0 implement:

```text
LocalProjectStore
```

using the filesystem.

This makes future migration possible.

Later implementations could include:

```text
DatabaseProjectStore
GitProjectStore
RemoteProjectStore
```

without rewriting the UI.

---

# 23. Stable IDs

Projects should use stable IDs.

Example:

```text
heat-islands
sensor-kit
cooling-policy
```

Documents should use stable identifiers:

```text
description
status
papers
resources
related-projects
artifacts
todos
timeline
```

Do not expose absolute local filesystem paths to the frontend.

---

# 24. AI API Design

Keep AI functionality simple.

Possible endpoints:

```text
/api/ai/ask
/api/ai/propose-update
/api/ai/suggest
```

## Ask

Input:

```text
project context
user question
```

Output:

```text
answer
supporting documents
```

No file modifications.

## Propose Update

Input:

```text
project context
user instruction
```

Output should be structured.

Example:

```json
{
  "summary": "Update project based on Sep 27 meeting",
  "changes": [
    {
      "documentId": "status",
      "newContent": "..."
    },
    {
      "documentId": "todos",
      "newContent": "..."
    }
  ]
}
```

The application computes and displays the diff.

Do not let the model directly write arbitrary files.

## Suggest

Input:

```text
project context
```

Output:

```text
suggestions
reason for each suggestion
possible action
```

Suggestions remain ephemeral until accepted.

---

# 25. No Agent Framework in V0

Do not use:

- LangChain
- LangGraph
- autonomous agent loops
- multi-agent frameworks
- vector databases
- complex tool orchestration

A few well-designed LLM calls are sufficient.

The goal is to build the product, not an AI infrastructure stack.

---

# 26. V0 Priorities

Build in this order.

## Priority 1 — Core Project

Implement:

- project list
- project page
- Markdown loading
- Markdown rendering
- per-section Markdown editing
- save/cancel
- todos
- artifacts
- timeline
- meeting notes
- create/edit/delete meetings

At this point, Hallinta should already function as a useful research project management tool without AI.

## Priority 2 — Ask Hallinta

Implement:

```text
Ask Hallinta...
```

Hallinta reads project Markdown and answers questions.

## Priority 3 — Hallinta Update

Implement:

```text
Update project based on today's meeting.
```

Hallinta proposes changes.

Show diffs.

Require explicit approval.

## Priority 4 — Hallinta Suggestions

Generate a small number of grounded next-step suggestions.

Each suggestion must explain why.

## Priority 5 — Polish

Improve:

- typography
- spacing
- Markdown rendering
- empty states
- transitions
- loading states
- keyboard behavior

---

# 27. Non-Goals for V0

Do not build:

- authentication *(superseded: see §32, Solo and Team Modes)*
- multi-user accounts *(superseded: see §32)*
- cloud deployment infrastructure
- realtime collaborative editing
- comments
- notifications
- email integration
- Slack/Discord integration
- GitHub integration
- calendar integration
- vector search
- embeddings
- elaborate permissions *(§32 defines a deliberately small model; keep it small)*
- mobile app
- complicated project templates
- dependency graphs
- Gantt charts
- sprint planning
- story points

These can be considered later.

---

# 28. Future Compatibility

The local-first architecture should make future migration possible.

Possible future architecture:

```text
Browser
   ↕
Next.js
   ↕
ProjectStore
   ├── Local filesystem
   ├── Git repository
   └── Remote database/storage
```

Git is particularly attractive because Markdown is already canonical.

Git could later provide:

- version history
- rollback
- authorship
- diffs
- provenance
- synchronization

However, do not build Git integration into V0 unless the core experience is already working.

---

# 29. Product Personality

Hallinta should behave like a thoughtful research collaborator.

It should be:

- concise
- grounded
- observant
- transparent
- non-intrusive
- willing to surface uncertainty

Hallinta should not behave like:

- a corporate manager
- an overenthusiastic productivity coach
- an autonomous boss
- a generic chatbot
- a system that invents work simply to appear useful

Good:

> The drone survey has remained unresolved across the last two meetings. It may be worth deciding whether it is required for the current claim.

Bad:

> Great progress! 🚀 Here are 10 exciting things you should do next!

The goal is not to maximize the number of tasks.

The goal is to help the group maintain a coherent understanding of the research.

---

# 30. Successful V0

The first version is successful if the following workflow feels good:

1. Create a research project.
2. Write the project description.
3. Fill in the current status.
4. Add papers and resources.
5. Track ongoing and finished artifacts.
6. Maintain todos.
7. Maintain the timeline.
8. Create a meeting note.
9. Edit any section directly in Markdown.
10. Ask Hallinta:
   - “Where are we?”
11. Ask Hallinta:
   - “Update the project based on today's meeting.”
12. Review the proposed Markdown diffs.
13. Accept the changes.
14. Ask Hallinta:
   - “What should we do next?”
15. See a small number of grounded suggestions.
16. Accept one suggestion into `todos.md`.

If this workflow works cleanly, stop adding features and start using Hallinta on a real research project.

---

# 31. Status and Direction (updated 2026-09-28)

V0 (§26, all priorities) is built. Beyond the V0 spec, Hallinta also has:

- Home page **List | Graph** views; the graph links projects via `[[refs]]` in Related Projects.
- **Archiving**: archived projects move to `<data>/archive/<id>/`, keep their URL and links, and are hidden from the graph.
- Editable project name and members.
- **Merge completed** todos into Current Status (reviewed as diffs, like all Hallinta edits).
- **HTML export**: a project snapshot (everything except meeting notes) and individual meeting notes, as self-contained files for sharing.
- Project data lives outside the app repo (`data/` is git-ignored; `examples/` holds fixtures). `npm test` runs the unit tests.

Direction: a public GitHub release that serves both a PI working alone and a lab where students and collaborators are users. This is done with **one system** (§32), not separate products.

---

# 32. Solo and Team Modes

## 32.1 One system, accounts optional

- **Solo mode** (default after install): no accounts, no login. The person at the keyboard is implicitly root. Hallinta serves only the local machine (it binds to `127.0.0.1`; see README).
- **Team mode**: enabled when the first root account is created. Everyone signs in; access is checked on every request.
- Permission checks **always run**. In solo mode the current user is simply the implicit root, so there is one code path, and tests cover both modes.
- Switching from solo to team is configuration, not migration. Project data stays in the same Markdown folders.
- First root setup is only possible from the local machine, so an exposed server cannot be claimed by a stranger.

## 32.2 Roles

Three tiers:

| Role | Who | Can |
| --- | --- | --- |
| **root** | PIs | Everything an admin can, plus manage accounts: invite and remove people, set passwords, assign roles (root / admin / regular). |
| **admin** | e.g. senior students, postdocs | Create projects; see and edit all projects; archive and unarchive; assign per-project access. Cannot manage accounts or roles. |
| **regular** | students, external collaborators | Only the projects they are granted, at **view** or **edit** level. |

- Multiple roots are allowed (e.g. co-PIs). The last root cannot be demoted, disabled, or removed.
- Only root and admins create projects.

## 32.3 Project access

- Per project, each regular user has **none**, **view**, or **edit**. Root and admins implicitly have edit on every project.
- **view**: read the project page and meeting notes; see the project in the list and graph; export it.
- **edit**: everything in view, plus edit sections and meeting notes, toggle todos, and use Hallinta's AI features on that project (Ask, Suggest, Merge completed, proposed updates).
- AI runs on the installation's API key, so it requires **edit** access. View-only users (e.g. external collaborators) never spend credits.
- Projects a user cannot view do not appear anywhere: list, graph, or links. `[[refs]]` to them render as plain text.
- Access is stored in the project's `project.json` (e.g. `"access": { "<userId>": "edit" }`). The descriptive `members` list stays separate: it may name people without accounts.

## 32.4 Sign-in

Both methods are supported; root chooses per person.

- **Password**: root sets an initial password; the user can change it. Passwords are hashed (scrypt); never stored or logged in plain text.
- **Google**: invite-only. Root adds the person's email first; only a verified Google account with that email can sign in. Anyone else sees "not invited". This works for external collaborators with any Google account.
- Sessions are signed, HTTP-only cookies. No third-party auth service.

## 32.5 Where account data lives

- Accounts live in `<data>/.hallinta/users.json` (id, name, email, role, sign-in methods, password hash, disabled). The session-signing secret lives next to it or in the environment. This is application metadata, not research content, so it is the one place outside the Markdown files that holds state.
- Nothing about accounts is ever sent to the AI provider.

## 32.6 Enforcement rules

- Every server action, route handler, and page checks access **on the server** through one authorization helper. Hiding a button in the UI is cosmetic, never the protection.
- Access rules are unit-tested rule by rule, including denial cases.
- Hallinta's AI routes check edit access before loading any project content.

## 32.7 Not in scope (yet)

- Per-section permissions, groups/teams, or approval workflows.
- Audit history of who changed what (a future Git-backed store could provide it; §28).
- Usage quotas for AI; revisit if needed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

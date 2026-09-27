# Changelog

## 0.1.0 — 2026-09-28

First public release.

### Projects as living Markdown
- One page per project with description, current status, papers, resources, related projects, artifacts, todos, timeline, and meeting notes, each backed by its own Markdown file and editable in place.
- Tick todos directly on the page; `[[Project Name]]` links between projects.
- Home page list and graph views; archive projects to `data/archive/`.
- HTML export of a project snapshot (without meeting notes) and of individual meeting notes.

### Hallinta, the AI collaborator (Anthropic Claude)
- **Ask Hallinta**: answers questions about a project with line-level citations.
- **Proposed updates**: describe what happened; Hallinta proposes targeted edits reviewed per file as diffs (accept, edit, or reject). Warnings for dropped open todos, removed open questions, and large deletions.
- **Todo suggestions**, each grounded in quoted project text; dismissed ideas don't come back.
- **Merge completed** todos into Current Status.
- Claude Haiku 4.5 by default; `HALLINTA_MODEL` and `HALLINTA_UPDATE_MODEL` to choose models.

### Solo and team modes
- Solo mode by default: no accounts, local machine only.
- Team mode: root / admin / regular roles, per-project view or edit access set from each project's members, password sign-in, and invite-only Google sign-in.
- Server-side authorization on every page, action, and route, with a test that fails if any is missing.

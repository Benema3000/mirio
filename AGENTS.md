# Repository workflow

- Work directly on `main` and push completed changes there. Do not create a
  separate branch or pull request unless the user asks for one.
- Run `git pull --ff-only origin main` before starting work, at clean checkpoints
  during longer tasks, and again before pushing. Integrate any remote changes
  before continuing so conflicts stay small.
- Preserve local work. If histories diverge or a pull is blocked by local
  changes, inspect and integrate them without discarding changes or force-pushing.
- Preserve Miro's original drawings and the assets derived from them unless the
  user explicitly requests changes to that artwork.

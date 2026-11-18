# Research Skill Tree

The Skill Tree is independent of roadmap chapters and XP. Confirmed proficiency is a manual self-assessment from 0 (Not started) to 4 (Advanced); actual changes retain a timestamped history. Prerequisites recommend learning paths and never block proficiency confirmation. Self-references and cycles are rejected.

Initialization requires an explicit user action. The six-category, 24-skill template and persistent initialization marker are created in one guarded transaction. Reads never initialize the tree, repeated initialization does not duplicate it, and archiving all skills does not recreate defaults.

Each association has one stable source identity and an optional target level (1–4). General-development associations use no target. Targeted readiness combines source types at the assigned level, requires at least one available activity, and requires every assigned activity to be resolved and complete. Missing references prevent readiness. General-development tasks, manually completed goals, and validated checkpoints have separate indicators; none gates another group. Readiness never changes proficiency or source records.

Archiving preserves evidence, associations, prerequisites and proficiency history. Archived categories exclude their skills from active summaries while retaining them in archived views. Archived records are read-only. Evidence permits plain notes or HTTP/HTTPS links; remote content is never embedded.

Backup schema version remains 1. Optional `skillCategories`, `researchSkills`, and `skillTreeState` sections preserve all feature records. Legacy backups restore an empty, uninitialized tree. Existing digest/revision checks and atomic replace-all restore remain in force. Unavailable historical activity references are retained, while malformed links, invalid levels, cycles and unsafe evidence URLs are rejected.

Validation uses dedicated disposable databases. Never initialize test data or restore test backups into `phd_quest`, and never remove the external MongoDB volume. Production data fingerprints contain counts/hashes only; generated browser artifacts and backup fixtures remain ignored.

The API root is `/api/research-skills`: GET reads the tree; POST creates a custom skill. `/initialize`, `/summary`, and `/categories` cover template state, dashboard metrics and category management. Skill IDs support detail/edit/archive, explicit `/proficiency` confirmation and `/evidence` management. Numeric `sortOrder` updates reorder categories and skills. References use `sourceType` plus canonical `sourceId` and optional `targetLevel`.

Final verification on 18 November 2026: Nest backend and Angular frontend production builds passed; 42 existing unit/HTTP/rules tests, 11 meeting regression tests and 11 Skill Tree tests passed. The existing Focus integration script passed. Skill Tree tests cover concurrent initialization, manual/no-op/decreasing history, cycles, targeted and separate untargeted readiness, missing links, safe evidence, legacy formats, round trips and transactional rollback. Browser results are stored in ignored `.artifacts/skills/` in the frontend. Existing research collection fingerprints remained unchanged; the external volume retained its creation timestamp `2026-11-14T22:45:53Z`.

The final Chrome workflow passed 19 checks, including tree/list navigation, cross-week linking, persisted target selection, readiness/reopening, evidence CRUD, category/skill archives, desktop/mobile themes, dashboard/Help, error recovery and browser export/preview/confirmed restore. Live GET endpoints returned 200 on ports 3000 and 4200. No unresolved feature failures or unavailable mandatory checks remain.

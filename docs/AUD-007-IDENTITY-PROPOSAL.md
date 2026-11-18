# AUD-007 checkpoint identity design (approved)

Status: explicitly approved by the user during Stage 2 and implemented. Legacy links remain unverified until explicitly relinked; no bulk migration runs.

## Current evidence

Roadmap replacement deletes/recreates levels and accepts public checkpoint IDs from JSON. Skill links store `sourceType=roadmap_checkpoint` with `sourceId=levelNumber:checkpointId`; Meeting links store `{levelNumber,checkpointId}`. Resolution and legacy version-1 backups have no generation metadata or historical checkpoint snapshot. Goal-to-checkpoint links are embedded in the current roadmap and already disappear on replacement; optional Goal level references identify chapters, not checkpoints.

Consequently, a legacy association cannot prove whether the current same-named composite ID is its original checkpoint. Binding such a link to a newly assigned identity would guess historical meaning. Treating it as unverified changes existing legacy-backup derived progress behavior. Section 8 of the Stage 2 brief explicitly requires approval before that decision.

## Concrete conservative design

1. Add an optional immutable server-generated `checkpointIdentity` UUID to each checkpoint and to Skill checkpoint associations and Meeting checkpoint references. Keep existing public IDs, route paths and JSON roadmap-import contract unchanged.
2. Preserve identity on ordinary title/evidence/validation edits. Full roadmap replacement creates new UUIDs for all checkpoints, even when public composite IDs repeat. Current-roadmap embedded goal links retain their existing replacement-reset policy.
3. New linking commands capture the checkpoint's UUID under applicationWrite. If a current legacy checkpoint has no UUID, assign one in that explicit linking command, never in GET. Reject mismatched supplied identities; never infer identity for an existing historical association.
4. Resolve qualified links only when both composite key and UUID match. Preserve replaced/missing links as unavailable history with completion false and readiness blocked; never retarget them by public ID alone.
5. Keep identity-less legacy links and backups intact, but show their checkpoint resolution as **unverified**. They do not count as completed or ready. The user can explicitly unlink/relink them to attest that the current checkpoint is intended; Stage 1 version preconditions remain mandatory.
6. Keep schemaVersion 1. Validate optional identities, export and restore them exactly; old backups remain accepted with identity-less links unverified. Restore continues to rotate operational editor tokens, independently from checkpoint identity.
7. No bulk migration, progress reset, research-record rewrite, automatic XP change or change to manual checkpoint validation/unlocking. Existing confirmed Skill proficiency and Meeting action status remain intact.

Approved decision: accept conservative unverified treatment for legacy checkpoint links and old-backup checkpoint-derived readiness, with explicit relinking required. Alternative: defer AUD-007 while completing the other Stage 2 findings. No automatic migration can safely recover historical identity from the current records alone.

import { RoadmapLevel } from '../../persistence/interfaces/roadmap.interface';
export interface CheckpointIdentityRef {
  levelNumber: number;
  checkpointId: string;
  checkpointIdentity?: string;
}
export function resolveCheckpoint(
  ref: CheckpointIdentityRef,
  levels: Pick<RoadmapLevel, 'levelNumber' | 'checkpoints'>[],
) {
  if (!ref.checkpointIdentity) return { resolution: 'unverified' as const, checkpoint: undefined };
  const checkpoint = levels
    .find((l) => l.levelNumber === ref.levelNumber)
    ?.checkpoints.find(
      (c) => c.id === ref.checkpointId && c.checkpointIdentity === ref.checkpointIdentity,
    );
  return checkpoint
    ? { resolution: 'resolved' as const, checkpoint }
    : { resolution: 'missing' as const, checkpoint: undefined };
}

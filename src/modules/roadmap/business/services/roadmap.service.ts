import { applicationWrite } from '../../../../database/application-write';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { RoadmapRepository } from '../../persistence/repositories/roadmap.repository';
import { CheckpointUpdateDto } from '../../api/dtos/roadmap.dto';
@Injectable()
export class RoadmapService {
  constructor(private readonly repository: RoadmapRepository, private readonly clock: ApplicationClock, @InjectConnection() private readonly connection: Connection) {}
  list(session?: ClientSession) { return this.repository.list(session); }
  async detail(number: number, session?: ClientSession) {
    const level = await this.repository.find(number, session);
    if (!level) throw new NotFoundException('Research level not found.');
    return level;
  }
  checkpoint(number: number, id: string, input: CheckpointUpdateDto) {
    return applicationWrite(this.connection, async session => {
      const level = await this.detail(number, session);
      if (level.status !== 'current') throw new ConflictException('Only the current research level can be corrected or validated. Completed levels are immutable.');
      const index = level.checkpoints.findIndex(checkpoint => checkpoint.id === id);
      if (index < 0) throw new NotFoundException('Checkpoint not found.');
      const checkpoint = level.checkpoints[index];
      const now = this.clock.now();
      const fields: Record<string, unknown> = {
        [`checkpoints.${index}.completed`]: input.completed,
        [`checkpoints.${index}.validatedAt`]: input.completed ? checkpoint.validatedAt ?? now : null,
        [`checkpoints.${index}.firstValidatedAt`]: input.completed ? checkpoint.firstValidatedAt ?? now : checkpoint.firstValidatedAt,
      };
      if (input.evidence !== undefined) fields[`checkpoints.${index}.evidence`] = input.evidence.trim();
      return this.repository.update(number, fields, session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  }
  edit(number: number, description: string) {
    return applicationWrite(this.connection, async session => {
      await this.detail(number, session);
      return this.repository.update(number, { description: description.trim() }, session);
    });
  }
  complete(number: number) {
    return applicationWrite(this.connection, async session => {
      const level = await this.detail(number, session);
      if (level.status === 'completed') return level;
      if (level.status !== 'current' || !level.checkpoints.filter(c => c.mandatory).every(c => c.completed)) throw new ConflictException('Validate all mandatory checkpoints on the current level before completing it.');
      const completed = await this.repository.update(number, { status: 'completed', completedAt: this.clock.now() }, session);
      if (number < 12) {
        const next = await this.detail(number + 1, session);
        if (next.status !== 'locked') throw new ConflictException('The next research level is not locked.');
        await this.repository.update(number + 1, { status: 'current' }, session);
      }
      return completed;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  }
}

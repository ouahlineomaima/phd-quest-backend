import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { applicationWrite } from '../../../../database/application-write';
import { BackupRepository } from '../../persistence/repositories/backup.repository';
import { BACKUP_SECTIONS, BackupFile, RESTORE_CONFIRMATION } from '../../persistence/interfaces/backup.interface';
import { backupDigest, validateBackup } from './backup-validation';
import { RestoreBackupDto } from '../../api/dtos/backup.dto';
@Injectable()
export class BackupService {
  constructor(private readonly repository: BackupRepository, private readonly clock: ApplicationClock, @InjectConnection() private readonly connection: Connection) {}
  private validate(input: unknown) {
    const file = validateBackup(input, this.clock.timezone);
    const prepared = this.repository.prepare(file);
    return { file, prepared, digest: backupDigest(file) };
  }
  async export(): Promise<BackupFile> {
    const file = await this.connection.transaction(async session => {
      const data = await this.repository.data(session);
      return { application: 'phd-quest', schemaVersion: 1, exportedAt: this.clock.now().toISOString(),
        settings: { timezone: this.clock.timezone, weeklyBaselineMinutes: 360 },
        counts: Object.fromEntries(BACKUP_SECTIONS.map(section => [section, data[section].length])), data } as BackupFile;
    }, { readConcern: { level: 'snapshot' }, readPreference: 'primary' });
    this.validate(file); // Never present an incomplete or unrestorable export as a successful backup.
    return file;
  }
  async preview(input: unknown) {
    const { file, digest } = this.validate(input);
    const revision = await this.connection.transaction(session => this.repository.revision(session), { readConcern: { level: 'snapshot' } });
    return { application: file.application, schemaVersion: file.schemaVersion, exportedAt: file.exportedAt, settings: file.settings, counts: file.counts, digest, revision, policy: 'replace-all' as const };
  }
  async restore(input: RestoreBackupDto) {
    if (input.confirmation !== RESTORE_CONFIRMATION) throw new BadRequestException('Explicit replacement confirmation is required.');
    const { file, prepared, digest } = this.validate(input.backup);
    if (digest !== input.digest) throw new ConflictException('The file changed after preview. Validate it again before restoring.');
    if (!await this.repository.transactionReady()) throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Restore requires a writable MongoDB replica set. No data was replaced.' });
    return applicationWrite(this.connection, async session => {
      // applicationWrite increments the revision before reading any application data.
      if (await this.repository.revision(session) !== input.revision + 1) throw new ConflictException('Application data changed after preview, or this restore already ran. Reload and preview again before replacing data.');
      await this.repository.replace(prepared, session);
      return { restored: true, restoredAt: this.clock.now().toISOString(), counts: file.counts, digest };
    }, { maxCommitTimeMS: 10000 });
  }
}

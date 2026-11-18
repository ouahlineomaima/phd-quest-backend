import { Equals, IsDefined, IsInt, IsObject, IsString, Matches, Min } from 'class-validator';
import { RESTORE_CONFIRMATION } from '../../persistence/interfaces/backup.interface';
export class PreviewBackupDto {
  @IsDefined() @IsObject() backup!: Record<string, unknown>;
}
export class RestoreBackupDto extends PreviewBackupDto {
  @Equals(RESTORE_CONFIRMATION) confirmation!: typeof RESTORE_CONFIRMATION;
  @IsString() @Matches(/^[a-f0-9]{64}$/) digest!: string;
  @IsInt() @Min(0) revision!: number;
}

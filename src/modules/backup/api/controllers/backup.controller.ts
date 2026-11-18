import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { BackupService } from '../../business/services/backup.service';
import { PreviewBackupDto, RestoreBackupDto } from '../dtos/backup.dto';
@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}
  @Get('export') async export(
    @Res({ passthrough: true }) response: { setHeader: (name: string, value: string) => void },
  ) {
    const file = await this.backup.export();
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="phd-quest-backup-${file.exportedAt.slice(0, 10)}.json"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    return file;
  }
  @Post('preview') preview(@Body() input: PreviewBackupDto) {
    return this.backup.preview(input.backup);
  }
  @Post('import') restore(@Body() input: RestoreBackupDto) {
    return this.backup.restore(input);
  }
}

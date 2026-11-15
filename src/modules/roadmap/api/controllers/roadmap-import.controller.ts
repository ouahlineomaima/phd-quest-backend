import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RoadmapImportService } from '../../business/services/roadmap-import.service';
import { ConfirmRoadmapDto, PreviewRoadmapDto } from '../dtos/roadmap-import.dto';
@Controller('roadmap/import')
export class RoadmapImportController {
  constructor(private readonly importer: RoadmapImportService) {}
  @Post('preview') @HttpCode(200) preview(@Body() input: PreviewRoadmapDto) { return this.importer.preview(input.roadmap); }
  @Post('confirm') confirm(@Body() input: ConfirmRoadmapDto) { return this.importer.confirm(input); }
}

import { Controller, Get } from '@nestjs/common';
import { GamificationService } from '../../business/services/gamification.service';
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}
  @Get('summary') summary() {
    return this.gamification.summary();
  }
}

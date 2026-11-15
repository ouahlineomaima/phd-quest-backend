import { Controller, Get } from '@nestjs/common';
import { AchievementsService } from '../../business/services/achievements.service';
@Controller('achievements')
export class AchievementsController { constructor(private readonly achievements:AchievementsService){} @Get() list(){return this.achievements.read();} }

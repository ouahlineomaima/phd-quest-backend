import { EmptyReopenBodyPipe } from '../../../weekly-plans/api/dtos/task-progress.dto';
import { Body, Controller, Get, Post, HttpCode } from '@nestjs/common';
import { AchievementsService } from '../../business/services/achievements.service';
@Controller('achievements')
export class AchievementsController { constructor(private readonly achievements:AchievementsService){} @Get() list(){return this.achievements.read();} @Post('evaluate') @HttpCode(200) evaluate(@Body(new EmptyReopenBodyPipe()) _body:unknown){return this.achievements.refresh();} }

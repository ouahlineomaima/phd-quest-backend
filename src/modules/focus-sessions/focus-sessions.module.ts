import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeModule } from '../../common/application-clock';
import { FOCUS_MODEL, focusSessionSchema } from './persistence/models/focus-session.model';
import { FocusSessionsController } from './api/controllers/focus-sessions.controller';
import { FocusSessionsService } from './business/services/focus-sessions.service';
import { FocusSessionsRepository } from './persistence/repositories/focus-sessions.repository';
import { FocusLifecycleService } from './business/services/focus-lifecycle.service';
@Module({
  imports: [
    TimeModule,
    MongooseModule.forFeature([{ name: FOCUS_MODEL, schema: focusSessionSchema }]),
  ],
  controllers: [FocusSessionsController],
  providers: [FocusSessionsRepository, FocusSessionsService, FocusLifecycleService],
  exports: [MongooseModule, FocusSessionsService],
})
export class FocusSessionsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeModule } from '../../common/application-clock';
import { MEETING_MODEL, meetingSchema, SUPERVISOR_MODEL, supervisorSchema } from './persistence/models/meeting.model';
import { MeetingsRepository } from './persistence/repositories/meetings.repository';
import { MeetingsService } from './business/services/meetings.service';
import { MeetingsController, SupervisorsController } from './api/controllers/meetings.controller';
@Module({imports:[TimeModule,MongooseModule.forFeature([{name:SUPERVISOR_MODEL,schema:supervisorSchema},{name:MEETING_MODEL,schema:meetingSchema}])],providers:[MeetingsRepository,MeetingsService],controllers:[SupervisorsController,MeetingsController],exports:[MongooseModule,MeetingsService]})
export class SupervisorMeetingsModule {}

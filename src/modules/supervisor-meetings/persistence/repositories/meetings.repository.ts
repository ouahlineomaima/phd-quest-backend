import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { MEETING_MODEL, SUPERVISOR_MODEL } from '../models/meeting.model';
import { MeetingRecord, SupervisorRecord } from '../interfaces/meeting.interface';
@Injectable()
export class MeetingsRepository implements OnModuleInit {
  constructor(@InjectModel(SUPERVISOR_MODEL) readonly supervisors: Model<SupervisorRecord>, @InjectModel(MEETING_MODEL) readonly meetings: Model<MeetingRecord>, @InjectConnection() private readonly connection: Connection) {}
  async onModuleInit() {
    await this.supervisors.createCollection(); await this.meetings.createCollection();
    await this.supervisors.collection.createIndex({archivedAt:1,name:1});
    for (const index of [{archivedAt:1,scheduledAt:1},{status:1,scheduledAt:1},{supervisorIds:1,scheduledAt:1},{'actions.status':1,'actions.dueDate':1},{'actions.phase':1}]) await this.meetings.collection.createIndex(index as any);
  }
  async taskStates(sources: string[], session: ClientSession) {
    if (!sources.length) return [];
    return this.connection.collection('weekly_plans').aggregate<{sourceId:string;weekId:string;taskId:string;title:string;status:string;date:string}>([
      {$match:{weekId:{$in:[...new Set(sources.map(s=>s.split(':')[0]))]}}}, {$unwind:'$tasks'},
      {$project:{_id:0,sourceId:{$concat:['$weekId',':','$tasks.id']},weekId:1,taskId:'$tasks.id',title:'$tasks.title',status:'$tasks.status',date:'$tasks.date'}},
      {$match:{sourceId:{$in:sources}}},
    ], {session}).toArray();
  }
  goals(ids: string[], session: ClientSession) { return this.connection.collection('goals').find({_id:{$in:ids.map(id=>new this.connection.base.Types.ObjectId(id))}},{session,projection:{title:1,status:1}}).toArray(); }
  levels(numbers: number[], session: ClientSession) { return this.connection.collection('roadmap_levels').find({levelNumber:{$in:numbers}},{session,projection:{levelNumber:1,title:1,checkpoints:1}}).toArray(); }
}

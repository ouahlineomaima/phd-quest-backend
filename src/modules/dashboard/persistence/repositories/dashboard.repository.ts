import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';
import { WeeklyPlanRecord } from '../../../weekly-plans/persistence/interfaces/weekly-plan.interface';
@Injectable()
export class DashboardRepository {
 constructor(@InjectConnection() private readonly connection:Connection) {}
 currentPlan(weekId:string,session:ClientSession) { return this.connection.collection<WeeklyPlanRecord>('weekly_plans').findOne({weekId},{session}); }
 recentActivity(session:ClientSession) { return this.connection.collection('daily_activity').aggregate([
  {$sort:{date:-1}},{$limit:10},{$unwind:'$events'},{$sort:{'events.occurredAt':-1,'events.eventId':1}},{$limit:10},
  {$project:{_id:0,date:1,eventId:'$events.eventId',sourceId:'$events.sourceId',planId:'$events.planId',taskId:'$events.taskId',occurredAt:'$events.occurredAt'}},
 ],{session}).toArray(); }
}

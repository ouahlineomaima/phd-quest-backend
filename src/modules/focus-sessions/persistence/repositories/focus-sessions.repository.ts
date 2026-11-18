import { WeeklyPlanRecord } from '../../../weekly-plans/persistence/interfaces/weekly-plan.interface';
import { FocusMode, FocusCompletion } from '../enums/focus.enums';
import { localDateAt } from '../../../../common/application-clock';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { FOCUS_MODEL } from '../models/focus-session.model';
import { FocusSession } from '../interfaces/focus-session.interface';
@Injectable()
export class FocusSessionsRepository implements OnModuleInit {
  constructor(@InjectModel(FOCUS_MODEL) private readonly model:Model<FocusSession>,@InjectConnection() private readonly connection:Connection) {}
  async onModuleInit(){await this.model.createCollection();await this.model.collection.createIndex({sessionId:1},{unique:true,name:'focus_session_identity'});await this.model.collection.createIndex({endedAt:-1,sessionId:1},{name:'focus_history'});}
  find(sessionId:string,session:ClientSession){return this.model.findOne({sessionId},{_id:0,__v:0}).session(session).lean().exec();}
  async insert(fields:object,session:ClientSession){const [record]=await this.model.create([fields],{session});const {_id,__v,...saved}=record.toObject();return saved;}
  async history(page:number,limit:number,session:ClientSession){return {items:await this.model.find({},{_id:0,__v:0}).sort({endedAt:-1,sessionId:1}).skip((page-1)*limit).limit(limit).session(session).lean(),total:await this.model.countDocuments().session(session),page,limit};}
  apply(sessionId:string,minutes:number,at:Date,session:ClientSession){return this.model.findOneAndUpdate({sessionId,appliedAt:null},{$set:{appliedAt:at,appliedMinutes:minutes}},{new:true,session,projection:{_id:0,__v:0}}).lean().exec();}
  async task(taskRef:string,session:ClientSession){const [weekId,id]=taskRef.split(':');const plan=await this.connection.collection<WeeklyPlanRecord>('weekly_plans').findOne({weekId,'tasks.id':id},{session});return plan?.tasks.find(task=>task.id===id);}
  applied(weekId:string,session:ClientSession){return this.model.aggregate<{_id:string;minutes:number}>([{$match:{taskRef:{$regex:'^'+weekId+':'},appliedAt:{$ne:null}}},{$group:{_id:'$taskRef',minutes:{$sum:'$appliedMinutes'}}}]).session(session).exec();}
  async days(timezone:string,session:ClientSession){
    // Use the same calendar as streaks; MongoDB and Node can ship different timezone tables.
    const rows=await this.model.find({},{_id:0,endedAt:1,focusedSeconds:1,mode:1,completionType:1}).session(session).lean();
    const days=new Map<string,{_id:string;seconds:number;count:number;countdowns:number}>();
    for(const row of rows){const date=localDateAt(row.endedAt,timezone),day=days.get(date)??{_id:date,seconds:0,count:0,countdowns:0};day.seconds+=row.focusedSeconds;day.count++;if(row.mode===FocusMode.Countdown&&row.completionType===FocusCompletion.TargetReached)day.countdowns++;days.set(date,day);}
    return [...days.values()];
  }
}

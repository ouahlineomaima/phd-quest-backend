import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { ACHIEVEMENT_MODEL } from '../models/achievement.model';
import { AchievementRecord } from '../interfaces/achievement.interface';
import { ACHIEVEMENT_DEFINITIONS } from '../../business/services/achievement-definitions';
@Injectable()
export class AchievementsRepository implements OnModuleInit {
 constructor(@InjectModel(ACHIEVEMENT_MODEL) private readonly model:Model<AchievementRecord>,@InjectConnection() private readonly connection:Connection) {}
 async onModuleInit() {
  await this.model.createCollection();await this.model.collection.createIndex({code:1},{unique:true,name:'achievement_code_unique'});
  const now=new Date();
  try { await this.model.bulkWrite(ACHIEVEMENT_DEFINITIONS.map(definition=>({updateOne:{filter:{code:definition.code},update:{$setOnInsert:{...definition,unlockedAt:null,createdAt:now,updatedAt:now}},upsert:true,timestamps:false}}))); }
  catch(error) { if((error as {code?:number}).code!==11000 || await this.model.countDocuments({code:{$in:ACHIEVEMENT_DEFINITIONS.map(d=>d.code)}})!==ACHIEVEMENT_DEFINITIONS.length)throw error; }
 }
 async evidence(session:ClientSession) {
  const options={session,projection:{_id:1}};
  const plan=!!await this.connection.collection('weekly_plans').findOne({},options);
  const goal=!!await this.connection.collection('goals').findOne({firstCompletedAt:{$type:'date'}},options);
  const checkpoint=!!await this.connection.collection('roadmap_levels').findOne({checkpoints:{$elemMatch:{firstValidatedAt:{$type:'date'}}}},options);
  const level=!!await this.connection.collection('roadmap_levels').findOne({status:'completed'},options);
  const distinct=await this.connection.collection('daily_activity').aggregate<{count:number}>([
   {$unwind:'$events'},{$match:{'events.sourceId':{$type:'string'}}},{$group:{_id:'$events.sourceId'}},{$limit:10},{$count:'count'},
  ],{session}).toArray();
  return {plan,goal,checkpoint,level,distinctTasks:distinct[0]?.count??0};
 }
 unlock(codes:string[],at:Date,session:ClientSession) { return this.model.updateMany({code:{$in:codes},unlockedAt:null},{$set:{unlockedAt:at}},{session}); }
 list(session:ClientSession) { return this.model.find({},{_id:0,__v:0}).sort({createdAt:1,code:1}).session(session).lean().exec(); }
}

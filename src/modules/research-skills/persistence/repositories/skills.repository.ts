import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { SKILL_CATEGORY_MODEL, RESEARCH_SKILL_MODEL, SKILL_TREE_STATE_MODEL } from '../models/research-skill.model';
import { CategoryRecord, SkillRecord, StateRecord } from '../interfaces/skill.interface';
@Injectable()
export class SkillsRepository implements OnModuleInit {
 constructor(@InjectModel(SKILL_CATEGORY_MODEL) readonly categories:Model<CategoryRecord>,@InjectModel(RESEARCH_SKILL_MODEL) readonly skills:Model<SkillRecord>,@InjectModel(SKILL_TREE_STATE_MODEL) readonly state:Model<StateRecord>,@InjectConnection() private readonly connection:Connection){}
 async onModuleInit(){await this.categories.createCollection();await this.skills.createCollection();await this.state.createCollection();await this.categories.collection.createIndex({archivedAt:1,sortOrder:1});await this.skills.collection.createIndex({categoryId:1,archivedAt:1,sortOrder:1});}
 async sources(session:ClientSession){
  const tasks=await this.connection.collection('weekly_plans').aggregate<any>([{$unwind:'$tasks'},{$project:{_id:0,sourceId:{$concat:['$weekId',':','$tasks.id']},title:'$tasks.title',completed:{$eq:['$tasks.status','completed']}}}],{session}).toArray();
  const goals=await this.connection.collection('goals').find({},{session,projection:{title:1,status:1,completedAt:1}}).toArray();
  const levels=await this.connection.collection('roadmap_levels').find({},{session,projection:{levelNumber:1,checkpoints:1}}).toArray();
  return new Map<string,{title:string;completed:boolean}>([...tasks.map(t=>['weekly_task:'+t.sourceId,{title:t.title,completed:t.completed}] as const),...goals.map(g=>['research_goal:'+g._id.toString(),{title:g.title,completed:g.status==='completed'||g.status==='archived'&&!!g.completedAt}] as const),...levels.flatMap(l=>l.checkpoints.map((c:any)=>['roadmap_checkpoint:'+l.levelNumber+':'+c.id,{title:c.title,completed:c.completed===true}] as const))]);
 }
}

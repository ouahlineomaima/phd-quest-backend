import { Schema } from 'mongoose';
import { AchievementRecord } from '../interfaces/achievement.interface';
export const ACHIEVEMENT_MODEL='Achievement';
export const achievementSchema=new Schema<AchievementRecord>({code:{type:String,required:true},title:String,description:String,icon:String,category:String,unlockedAt:{type:Date,default:null}},{collection:'achievements',timestamps:true,autoCreate:false,autoIndex:false});

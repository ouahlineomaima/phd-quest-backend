import { FocusMode, FocusCompletion } from '../enums/focus.enums';
import { Schema } from 'mongoose';
import { FocusSession } from '../interfaces/focus-session.interface';
export const FOCUS_MODEL = 'FocusSession';
export const focusSessionSchema = new Schema<FocusSession>({
  sessionId: {type:String,required:true}, mode:{type:String,enum:Object.values(FocusMode),required:true},
  targetSeconds:{type:Number,default:null}, startedAt:{type:Date,required:true}, endedAt:{type:Date,required:true},
  focusedSeconds:{type:Number,min:1,max:604800,required:true}, taskRef:{type:String,default:null},taskTitle:{type:String,default:null,maxlength:160},
  completionType:{type:String,enum:Object.values(FocusCompletion),required:true},
  appliedAt:{type:Date,default:null},appliedMinutes:{type:Number,min:0,default:0},
},{collection:'focus_sessions',timestamps:true,strict:'throw',autoCreate:false,autoIndex:false});

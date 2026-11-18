import { BadRequestException } from '@nestjs/common';
import { Schema, SchemaType } from 'mongoose';
import { LegacyBackupData, BACKUP_SECTIONS, BackupSection } from '../../persistence/interfaces/backup.interface';
import { weeklyPlanSchema } from '../../../weekly-plans/persistence/models/weekly-plan.model';
import { xpTransactionSchema } from '../../../gamification/persistence/models/xp-transaction.model';
import { dailyActivitySchema } from '../../../daily-activity/persistence/models/daily-activity.model';
import { roadmapSchema } from '../../../roadmap/persistence/models/roadmap.model';
import { goalSchema } from '../../../goals/persistence/models/goal.model';
import { achievementSchema } from '../../../achievements/persistence/models/achievement.model';
import { focusSessionSchema } from '../../../focus-sessions/persistence/models/focus-session.model';
import { supervisorSchema, meetingSchema } from '../../../supervisor-meetings/persistence/models/meeting.model';
import { skillCategorySchema,researchSkillSchema,skillTreeStateSchema } from '../../../research-skills/persistence/models/research-skill.model';
const schemas:Record<BackupSection,Schema>={weeklyPlans:weeklyPlanSchema,xpTransactions:xpTransactionSchema,dailyActivity:dailyActivitySchema,roadmapLevels:roadmapSchema,goals:goalSchema,achievements:achievementSchema,focusSessions:focusSessionSchema,supervisors:supervisorSchema,supervisorMeetings:meetingSchema,skillCategories:skillCategorySchema,researchSkills:researchSkillSchema,skillTreeState:skillTreeStateSchema};
type InspectedPath=SchemaType & {schema?:Schema;caster?:SchemaType;enumValues?:unknown[]};
function invalid():never {throw new BadRequestException({code:'INVALID_BACKUP',message:'Backup contains incorrect field types.'});}
function object(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function valueAt(row:Record<string,unknown>,path:string):unknown {let value:unknown=row;for(const part of path.split('.')){if(!object(value))return undefined;value=value[part];}return value;}
function field(value:unknown,path:InspectedPath):void {
 if(value===undefined){if(path.isRequired)invalid();return;}
 if(value===null){if(path.isRequired)invalid();return;}
 if(path.instance==='Array'){
  if(!Array.isArray(value))invalid();for(const item of value){if(path.schema)record(item,path.schema);else if(path.caster)field(item,path.caster);}return;
 }
 if(path.schema){record(value,path.schema);return;}
 if(path.instance==='String'&&typeof value!=='string'||path.instance==='Number'&&(typeof value!=='number'||!Number.isFinite(value))||path.instance==='Boolean'&&typeof value!=='boolean'||path.instance==='Date'&&typeof value!=='string')invalid();
 if(path.enumValues?.length&&!path.enumValues.includes(value))invalid();
}
function record(value:unknown,schema:Schema):void {
 if(!object(value))invalid();schema.eachPath((name,path)=>{if(!['_id','__v','editVersion'].includes(name))field(valueAt(value,name),path as InspectedPath);});
}
// No Mongoose casting: reject incorrect primitive/array types before typed semantic
// traversal. Required keys, limits, histories and cross-record rules are checked next.
export function checkedBackupData(input:Record<string,unknown>):LegacyBackupData {
 for(const section of BACKUP_SECTIONS){const rows=input[section];if(rows===undefined)continue;if(!Array.isArray(rows))invalid();for(const row of rows)record(row,schemas[section]);}
 return input as LegacyBackupData;
}

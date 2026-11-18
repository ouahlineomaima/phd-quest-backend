import { Types } from 'mongoose';
export interface Association {sourceType:'weekly_task'|'research_goal'|'roadmap_checkpoint';sourceId:string;targetLevel:number|null;}
export interface Evidence {id:string;title:string;type:'note'|'external_link';description:string;url:string|null;createdAt:Date;updatedAt:Date;}
export interface ProficiencyChange {id:string;fromLevel:number;toLevel:number;changedAt:Date;justification:string;}
export interface CategoryRecord { editVersion?:string;_id:Types.ObjectId;name:string;description:string;icon:string;color:string;sortOrder:number;archivedAt:Date|null;createdAt:Date;updatedAt:Date;}
export interface SkillRecord { editVersion?:string;_id:Types.ObjectId;categoryId:string;name:string;description:string;proficiency:number;prerequisiteIds:string[];associations:Association[];evidence:Evidence[];proficiencyHistory:ProficiencyChange[];sortOrder:number;archivedAt:Date|null;createdAt:Date;updatedAt:Date;}
export interface StateRecord {_id:Types.ObjectId;initializedAt:Date;createdAt:Date;updatedAt:Date;}

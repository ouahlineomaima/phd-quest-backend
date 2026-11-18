import { SkillLevel, SkillSourceType, TargetSkillLevel, EvidenceType, SkillIcon, SkillColor } from '../enums/skill.enums';
import { Types } from 'mongoose';
export interface Association {sourceType:SkillSourceType;sourceId:string;targetLevel:TargetSkillLevel|null;checkpointIdentity?:string;}
export interface Evidence {id:string;title:string;type:EvidenceType;description:string;url:string|null;createdAt:Date;updatedAt:Date;}
export interface ProficiencyChange {id:string;fromLevel:SkillLevel;toLevel:SkillLevel;changedAt:Date;justification:string;}
export interface CategoryRecord { editVersion?:string;_id:Types.ObjectId;name:string;description:string;icon:SkillIcon;color:SkillColor;sortOrder:number;archivedAt:Date|null;createdAt:Date;updatedAt:Date;}
export interface SkillRecord { editVersion?:string;_id:Types.ObjectId;categoryId:string;name:string;description:string;proficiency:SkillLevel;prerequisiteIds:string[];associations:Association[];evidence:Evidence[];proficiencyHistory:ProficiencyChange[];sortOrder:number;archivedAt:Date|null;createdAt:Date;updatedAt:Date;}
export interface StateRecord {_id:Types.ObjectId;initializedAt:Date;createdAt:Date;updatedAt:Date;}

export interface ActivityProgress {total:number;available:number;completed:number;missing:number;percentage:number|null;ready:boolean;state:'empty'|'unverified'|'complete'|'in_progress';}
export interface ResolvedAssociation extends Association {title:string;missing:boolean;completed:boolean;resolution:'resolved'|'missing'|'unverified';}

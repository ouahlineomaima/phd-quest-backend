import {SkillRecord,CategoryRecord,ResolvedAssociation,ActivityProgress} from '../../persistence/interfaces/skill.interface';
import {SkillLevel,TargetSkillLevel,SkillSourceType} from '../../persistence/enums/skill.enums';
export type CategoryResponse=Omit<CategoryRecord,'_id'|'editVersion'>&{id:string;editVersion:string};
export type SkillRecordResponse=Omit<SkillRecord,'_id'|'editVersion'>&{id:string;editVersion:string};
export interface SkillResponse extends Omit<SkillRecordResponse,'associations'> {associations:ResolvedAssociation[];effectiveArchived:boolean;categoryName:string;prerequisites:{id:string;name:string;proficiency:SkillLevel|null;archivedAt:Date|null;missing:boolean;developed:boolean}[];targeted:(ActivityProgress&{targetLevel:TargetSkillLevel;suggestReview:boolean})[];untargeted:(ActivityProgress&{sourceType:SkillSourceType})[];}
export interface SkillTreeResponse {initialized:boolean;categories:CategoryResponse[];skills:SkillResponse[];}

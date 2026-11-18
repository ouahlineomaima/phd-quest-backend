import { BadRequestException } from '@nestjs/common';
import { calendarOrdinal } from '../../../../common/calendar';
import { Association } from '../../persistence/interfaces/skill.interface';
export const sourceKey=(a:Pick<Association,'sourceType'|'sourceId'>)=>a.sourceType+':'+a.sourceId;
export function validateAssociations(links:Association[]){
 if(!Array.isArray(links)||links.length>300||new Set(links.map(sourceKey)).size!==links.length)throw new BadRequestException('Use unique activity associations.');
 for(const a of links){const valid=a.sourceType==='weekly_task'?/^\d{4}-\d{2}-\d{2}:[a-z0-9][a-z0-9_-]{0,63}$/.test(a.sourceId)&&calendarOrdinal(a.sourceId.slice(0,10))!==null&&new Date(a.sourceId.slice(0,10)+'T12:00:00Z').getUTCDay()===0:a.sourceType==='research_goal'?/^[a-f0-9]{24}$/.test(a.sourceId):a.sourceType==='roadmap_checkpoint'&&/^(?:[0-9]|1[0-2]):[a-z0-9][a-z0-9_-]{0,99}$/.test(a.sourceId);if(!valid||a.targetLevel!==null&&a.targetLevel!==undefined&&(!Number.isInteger(a.targetLevel)||a.targetLevel<1||a.targetLevel>4))throw new BadRequestException('Invalid activity identity or target proficiency level.');}
}
export function validateGraph(rows:{id:string;prerequisiteIds:string[]}[]){
 const graph=new Map(rows.map(r=>[r.id,r.prerequisiteIds])),done=new Set<string>(),visiting=new Set<string>();
 function visit(id:string){if(visiting.has(id))throw new BadRequestException('Prerequisites must not contain self references or cycles.');if(done.has(id))return;visiting.add(id);for(const next of graph.get(id)??[])visit(next);visiting.delete(id);done.add(id);}
 for(const row of rows){if(new Set(row.prerequisiteIds).size!==row.prerequisiteIds.length)throw new BadRequestException('Duplicate prerequisite.');visit(row.id);}
}
export function safeEvidence(input:{type:string;url?:string|null}){
 if(input.type==='note'){if(input.url)throw new BadRequestException('Note evidence has no external URL.');return;}
 try{const url=new URL(input.url??'');if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!url.hostname||/\s/.test(input.url??''))throw new Error();}catch{throw new BadRequestException('Use a safe HTTP/HTTPS evidence URL without credentials.');}
}
export function activityGroup(links:{missing:boolean;completed:boolean}[]){const total=links.length,available=links.filter(a=>!a.missing).length,completed=links.filter(a=>!a.missing&&a.completed).length,missing=total-available,ready=available>0&&missing===0&&completed===available;return {total,available,completed,missing,percentage:available&&missing===0?Math.round(completed/available*100):null,ready,state:!total?'empty':missing?'unverified':ready?'complete':'in_progress'};}

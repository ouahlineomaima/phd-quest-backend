import { editVersion, EditableRecord } from '../database/edit-version';
export function definedFields<T extends object>(input:T):Partial<T> { return Object.fromEntries(Object.entries(input).filter(([,value])=>value!==undefined)) as Partial<T>; }
export function recordResponse<T extends EditableRecord>(record:T) {
 const {_id,editVersion:_,...fields}=record;const clean={...fields} as Omit<T,'_id'|'editVersion'> & {__v?:number};delete clean.__v;
 return {id:_id.toString(),...clean,editVersion:editVersion(record)};
}

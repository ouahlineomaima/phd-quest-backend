import { BadRequestException } from '@nestjs/common';
import { calendarOrdinal } from '../../../../common/calendar';
export function meetingLocalTime(instant:Date,timezone:string) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant);
  const p=(name:string)=>parts.find(part=>part.type===name)!.value;
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}
export function meetingTimeLabel(instant:Date,timezone:string) {return new Intl.DateTimeFormat('en-GB',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(instant);}
export function meetingInstant(local:string,timezone:string):Date {
  if(typeof local!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)||calendarOrdinal(local.slice(0,10))===null||!Number.isFinite(Date.parse(local+'Z')))throw new BadRequestException('Choose a valid meeting date and local time.');
  const desired=Date.parse(local+'Z'),candidates=new Set<number>();
  // Sample both sides of any offset transition. Reject skipped/ambiguous local
  // times rather than silently scheduling a different instant.
  for(const hours of [-24,0,24]){
    const probe=desired+hours*3600000,represented=Date.parse(meetingLocalTime(new Date(probe),timezone)+'Z');
    const candidate=desired-(represented-probe);
    if(meetingLocalTime(new Date(candidate),timezone)===local)candidates.add(candidate);
  }
  if(candidates.size!==1)throw new BadRequestException(candidates.size?'This local time occurs twice in the application timezone. Choose another time or use scheduledAt with an explicit UTC offset.':'This local time is unavailable in the application timezone. Choose another time.');
  return new Date([...candidates][0]);
}

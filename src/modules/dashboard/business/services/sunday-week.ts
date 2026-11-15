import { calendarDates, calendarOrdinal } from '../../../../common/calendar';
export function sundayWeek(today:string) {
 const ordinal=calendarOrdinal(today);if(ordinal===null)throw new Error('Invalid application date');
 const [year,month,day]=today.split('-').map(Number);
 const startDate=new Date(Date.UTC(year,month-1,day-ordinal%7)).toISOString().slice(0,10);
 const dates=calendarDates(startDate);
 return {weekId:startDate,startDate,endDate:dates[6],dates};
}

const {test}=require('node:test'),assert=require('node:assert/strict');
const {meetingInstant,meetingLocalTime,meetingTimeLabel}=require('../../dist/modules/supervisor-meetings/business/services/meeting-time');
test('meeting local time is resolved by application timezone, independently of browser timezone data',()=>{
 const instant=meetingInstant('2026-11-20T14:30','Africa/Casablanca');assert.equal(instant.toISOString(),'2026-11-20T14:30:00.000Z');assert.equal(meetingLocalTime(instant,'Africa/Casablanca'),'2026-11-20T14:30');assert.match(meetingTimeLabel(instant,'Africa/Casablanca'),/14:30/);
 const ramadan=meetingInstant('2026-03-01T14:30','Africa/Casablanca');assert.equal(ramadan.toISOString(),'2026-03-01T14:30:00.000Z');
});
test('invalid calendar dates and skipped/ambiguous timezone transition times are rejected',()=>{
 for(const local of ['2026-02-30T14:30','2026-11-20T25:00','not-a-date'])assert.throws(()=>meetingInstant(local,'Africa/Casablanca'));
 assert.throws(()=>meetingInstant('2026-03-08T02:30','America/New_York'),/unavailable/);
 assert.throws(()=>meetingInstant('2026-11-01T01:30','America/New_York'),/occurs twice/);
});

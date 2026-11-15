const {test}=require('node:test');const assert=require('node:assert/strict');
const {playerProgress,levelThreshold}=require('../../dist/modules/gamification/business/services/player-level');
const {streaks}=require('../../dist/modules/daily-activity/business/services/streaks');
const {localDateAt}=require('../../dist/common/application-clock');
const {validateEnvironment}=require('../../dist/config/environment');
test('player thresholds continue deterministically beyond level six',()=>{
 [0,100,250,450,700,1000,1350].forEach((xp,index)=>{assert.equal(levelThreshold(index+1),xp);assert.equal(playerProgress(xp).playerLevel,index+1);assert.equal(playerProgress(xp).xpIntoLevel,0)});
 assert.equal(playerProgress(99).playerLevel,1);assert.equal(playerProgress(99).xpRemainingToNextLevel,1);
 assert.equal(playerProgress(levelThreshold(50)+123).playerLevel,50);
});
test('streaks use unique calendar days, retain yesterday and break across missing days',()=>{
 assert.deepEqual(streaks([],'2026-11-15'),{currentStreak:0,longestStreak:0});
 const dates=['2026-11-10','2026-11-11','2026-11-11','2026-11-12','2026-11-14'];
 assert.deepEqual(streaks(dates,'2026-11-15'),{currentStreak:1,longestStreak:3});
 assert.deepEqual(streaks(dates,'2026-11-16'),{currentStreak:0,longestStreak:3});
 assert.deepEqual(streaks([...dates,'2026-11-15'],'2026-11-15'),{currentStreak:2,longestStreak:3});
});
test('Casablanca midnight and Ramadan offset are explicit, independent of host timezone',()=>{
 assert.equal(localDateAt(new Date('2026-11-15T23:59:59Z'),'Africa/Casablanca'),'2026-11-15');
 assert.equal(localDateAt(new Date('2026-11-16T00:00:00Z'),'Africa/Casablanca'),'2026-11-16');
 assert.equal(localDateAt(new Date('2026-02-20T23:30:00Z'),'Africa/Casablanca'),'2026-02-20');
 assert.equal(localDateAt(new Date('2026-03-25T23:30:00Z'),'Africa/Casablanca'),'2026-03-26');
 assert.throws(()=>validateEnvironment({MONGODB_URI:'mongodb://localhost/test',APP_TIMEZONE:'not-a-zone'}),/APP_TIMEZONE/);
});

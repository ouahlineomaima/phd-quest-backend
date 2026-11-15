import { applicationWrite } from '../../../../database/application-write';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ApplicationClock } from '../../../../common/application-clock';
import { GamificationService } from '../../../gamification/business/services/gamification.service';
import { RoadmapService } from '../../../roadmap/business/services/roadmap.service';
import { GoalsService } from '../../../goals/business/services/goals.service';
import { AchievementsService } from '../../../achievements/business/services/achievements.service';
import { weeklyProgress } from '../../../weekly-plans/business/services/weekly-progress';
import { DashboardRepository } from '../../persistence/repositories/dashboard.repository';
import { sundayWeek } from './sunday-week';
@Injectable()
export class DashboardService {
 constructor(private readonly repository:DashboardRepository,private readonly gamification:GamificationService,private readonly roadmap:RoadmapService,private readonly goals:GoalsService,private readonly achievements:AchievementsService,private readonly clock:ApplicationClock,@InjectConnection() private readonly connection:Connection) {}
 read() {
  const at=this.clock.now(),today=this.clock.dateAt(at),week=sundayWeek(today);
  return applicationWrite(this.connection, async session=>{
   const gamification=await this.gamification.summary(session,at);
   const achievements=await this.achievements.evaluate(session,gamification);
   const levels=await this.roadmap.list(session),current=levels.find(l=>l.levelNumber>0&&l.status==='current')??null;
   const activeGoals=await this.goals.list({status:'active'},session,5);
   const activeCount=await this.goals.activeCount(session);
   const plan=await this.repository.currentPlan(week.weekId,session);
   const earnedXp=plan?await this.gamification.earnedForWeek(week.weekId,session):0;
   const recentActivity=await this.repository.recentActivity(session);
   const unlocked=achievements.filter(a=>a.unlockedAt!==null);
   return {asOf:at.toISOString(),timezone:this.clock.timezone,today,gamification,
    week:{weekId:week.weekId,startDate:week.startDate,endDate:week.endDate,baselineMinutes:360,
     planId:plan?plan._id.toString():null,title:plan?.title??null,
     progress:plan?weeklyProgress(plan,earnedXp):null,
     plannedMinutes:plan?.tasks.reduce((sum,t)=>sum+t.estimatedMinutes,0)??0,
     todayTasks:plan?.tasks.filter(t=>t.date===today)??[],
     days:week.dates.map(date=>{const tasks=plan?.tasks.filter(t=>t.date===date)??[];return {date,totalTasks:tasks.length,completedTasks:tasks.filter(t=>t.status==='completed').length,plannedMinutes:tasks.reduce((sum,t)=>sum+t.estimatedMinutes,0),actualMinutes:tasks.reduce((sum,t)=>sum+t.actualMinutes,0)};}),
    },
    research:{current,completedLevels:levels.filter(l=>l.levelNumber>0&&l.status==='completed').length,totalLevels:12,preparation:levels.find(l=>l.levelNumber===0)??null,checkpointCompleted:current?.checkpoints.filter(c=>c.completed).length??0,checkpointTotal:current?.checkpoints.length??0},
    goals:{activeCount,items:activeGoals},
    achievements:{total:achievements.length,unlocked:unlocked.length,recent:unlocked.sort((a,b)=>b.unlockedAt!.getTime()-a.unlockedAt!.getTime()).slice(0,3)},recentActivity,
   };
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});
 }
}

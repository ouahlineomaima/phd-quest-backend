import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ClientSession, Connection } from 'mongoose';
import { RoadmapLevel } from '../interfaces/roadmap.interface';
// Called only by an explicit guarded linking command, never by a read or restore.
export async function captureCheckpointIdentity(connection:Connection,levelNumber:number,checkpointId:string,session:ClientSession):Promise<string> {
 const collection=connection.collection<RoadmapLevel>('roadmap_levels');
 const level=await collection.findOne({levelNumber},{session});const checkpoint=level?.checkpoints.find(c=>c.id===checkpointId);
 if(!checkpoint)throw new BadRequestException('New checkpoint links must reference existing checkpoints.');
 if(checkpoint.checkpointIdentity)return checkpoint.checkpointIdentity;
 const identity=randomUUID();await collection.updateOne({levelNumber,'checkpoints.id':checkpointId},{$set:{'checkpoints.$.checkpointIdentity':identity}},{session});return identity;
}

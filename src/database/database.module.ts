import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { databaseOptions } from './database.options';

@Module({
  imports: [MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: databaseOptions })],
  exports: [MongooseModule],
})
export class DatabaseModule {}

import { Transform } from 'class-transformer';
import { IsArray, ArrayMaxSize, ArrayUnique, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
export class GoalFieldsDto {
 @ValidateIf((_object,value) => value !== undefined) @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsString({each:true}) @Matches(/^\d{4}-\d{2}-\d{2}:[a-z0-9][a-z0-9_-]{0,63}$/,{each:true}) linkedTaskIds?: string[];
 @IsOptional() @IsString() @MaxLength(2000) @Transform(({value}: {value:unknown}) => typeof value === 'string' ? value.trim() : value) description?: string;
 @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) targetDate?: string | null;
 @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) relatedWeekId?: string | null;
 @IsOptional() @IsInt() @Min(1) @Max(12) relatedRoadmapLevel?: number | null;
}
export class CreateGoalDto extends GoalFieldsDto {
 @IsString() @Matches(/\S/) @MaxLength(160) @Transform(({value}: {value:unknown}) => typeof value === 'string' ? value.trim() : value) title!: string;
 @IsIn(['weekly','monthly','research']) type!: 'weekly' | 'monthly' | 'research';
}
export class EditGoalDto extends GoalFieldsDto {
 @ValidateIf((_object,value) => value !== undefined) @IsString() @Matches(/\S/) @MaxLength(160) @Transform(({value}: {value:unknown}) => typeof value === 'string' ? value.trim() : value) title?: string;
 @ValidateIf((_object,value) => value !== undefined) @IsIn(['weekly','monthly','research']) type?: 'weekly' | 'monthly' | 'research';
}
export class GoalFilterDto {
 @ValidateIf((_object,value) => value !== undefined) @IsIn(['weekly','monthly','research']) type?: string;
 @ValidateIf((_object,value) => value !== undefined) @IsIn(['active','completed','archived']) status?: string;
}

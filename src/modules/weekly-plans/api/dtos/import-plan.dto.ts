import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Priority } from '../../persistence/enums/task.enums';
import { TaskInput, WeeklyPlanInput } from '../../persistence/interfaces/weekly-plan.interface';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const datePattern = /^(?:19|[2-9][0-9])[0-9]{2}-[0-9]{2}-[0-9]{2}$/;

export class ImportTaskDto implements TaskInput {
  @Transform(trim) @IsString() @Matches(/^[a-z0-9][a-z0-9_-]{0,63}$/) id!: string;
  @IsString() @Matches(datePattern) date!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @IsInt() @Min(1) @Max(1440) estimatedMinutes!: number;
  @IsInt() @Min(0) @Max(1000) xpReward!: number;
  @IsEnum(Priority) priority!: Priority;
  @IsBoolean() isOptional!: boolean;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) deliverable!: string;
}

export class ImportPlanDto implements WeeklyPlanInput {
  @Equals(1) schemaVersion!: 1;
  @IsString() @Matches(datePattern) weekId!: string;
  @IsString() @Matches(datePattern) startDate!: string;
  @IsString() @Matches(datePattern) endDate!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(300, { each: true })
  objectives!: string[];
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportTaskDto)
  tasks!: ImportTaskDto[];
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

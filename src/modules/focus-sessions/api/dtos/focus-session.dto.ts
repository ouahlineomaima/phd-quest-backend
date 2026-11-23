import { TASK_REFERENCE } from '../../../../common/identifiers';
import { FocusMode, FocusCompletion } from '../../persistence/enums/focus.enums';
import { Type } from 'class-transformer';
import {
  Equals,
  IsDateString,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
export class SaveFocusSessionDto {
  @IsString()
  @Matches(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  sessionId!: string;
  @IsIn(Object.values(FocusMode)) mode!: FocusMode;
  @ValidateIf((_o, v) => v !== null) @IsInt() @Min(60) @Max(10800) targetSeconds!: number | null;
  @IsDateString({ strict: true }) startedAt!: string;
  @IsDateString({ strict: true }) endedAt!: string;
  @IsInt() @Min(1) @Max(604800) focusedSeconds!: number;
  @ValidateIf((_o, v) => v !== null) @IsString() @Matches(TASK_REFERENCE) taskRef!: string | null;
  @IsIn(Object.values(FocusCompletion)) completionType!: FocusCompletion;
}
export class FocusHistoryQuery {
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page?: number;
  @ValidateIf((_o, v) => v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
export class TaskTimesQuery {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) weekId!: string;
}

export class ApplyFocusTimeDto {
  @Equals(true) confirm!: true;
  @ValidateIf((_o, v) => v !== undefined) @IsInt() @Min(0) @Max(1440) effectiveMinutes?: number;
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt()
  @Min(0)
  @Max(1440)
  expectedActualMinutes?: number;
}
export class CorrectFocusTimeDto {
  @IsInt() @Min(0) @Max(1440) effectiveMinutes!: number;
}

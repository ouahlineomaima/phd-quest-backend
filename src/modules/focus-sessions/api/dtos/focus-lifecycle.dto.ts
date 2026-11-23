import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { TASK_REFERENCE } from '../../../../common/identifiers';
import { FocusMode, FocusKind } from '../../persistence/enums/focus.enums';
export class StartFocusDto {
  @IsUUID('4') sessionId!: string;
  @IsUUID('4') ownerId!: string;
  @IsEnum(FocusMode) mode!: FocusMode;
  @ValidateIf((_o, v) => v !== null) @IsInt() @Min(60) @Max(10800) targetSeconds!: number | null;
  @ValidateIf((_o, v) => v !== null) @Matches(TASK_REFERENCE) taskRef!: string | null;
  @IsEnum(FocusKind) kind!: FocusKind;
}
export class FocusCommandDto {
  @IsOptional() @IsUUID('4') ownerId?: string;
}
export class FocusHeartbeatDto {
  @IsUUID('4') ownerId!: string;
  @IsUUID('4') ownerToken!: string;
  @IsInt() @Min(1) sequence!: number;
  @IsBoolean() activity!: boolean;
}

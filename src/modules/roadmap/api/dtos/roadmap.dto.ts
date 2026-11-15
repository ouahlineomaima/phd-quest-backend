import { IsArray, ArrayMaxSize, ArrayUnique, Equals, IsBoolean, ValidateIf, Matches, IsString, MaxLength, MinLength } from 'class-validator';
export class CheckpointUpdateDto {
  @IsBoolean() completed!: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(2000) evidence?: string;
}
export class CompleteLevelDto { @Equals(true) confirm!: true; }
export class EditLevelDto {
  @IsString() @Matches(/\S/) @MinLength(1) @MaxLength(3000) description!: string;
}

export class CheckpointGoalsDto {
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({each:true}) @Matches(/^[a-f0-9]{24}$/,{each:true}) goalIds!: string[];
}

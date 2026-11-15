import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, Equals, IsArray, IsBoolean, IsDefined, IsInt, IsObject, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export class ImportedCheckpointDto {
  @IsString() @Matches(slug) @MaxLength(100) id!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @ValidateIf((_object, value) => value !== undefined) @Transform(trim) @IsString() @MaxLength(3000) description?: string;
  @IsBoolean() required!: boolean;
}
export class ImportedLevelDto {
  @IsInt() @Min(1) @Max(12) levelNumber!: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(3000) description!: string;
  @Transform(({ value }: { value: unknown }) => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item.trim() : item) : value)
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) @MinLength(1, { each: true }) @MaxLength(300, { each: true }) objectives!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique((checkpoint: ImportedCheckpointDto) => checkpoint?.id) @ValidateNested({ each: true }) @Type(() => ImportedCheckpointDto) checkpoints!: ImportedCheckpointDto[];
}
export class RoadmapImportDto {
  @Equals(1) schemaVersion!: 1;
  @IsString() @Matches(slug) @MaxLength(100) roadmapId!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @Equals(3) durationYears!: 3;
  @IsArray() @ArrayMinSize(12) @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => ImportedLevelDto) levels!: ImportedLevelDto[];
}
// Preserve the raw inner object until size validation and normalization in the service.
export class PreviewRoadmapDto { @IsDefined() @IsObject() roadmap!: unknown; }
export class ConfirmRoadmapDto extends PreviewRoadmapDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) digest!: string;
  @IsInt() @Min(0) revision!: number;
  @Equals('REPLACE ROADMAP') confirmation!: 'REPLACE ROADMAP';
}

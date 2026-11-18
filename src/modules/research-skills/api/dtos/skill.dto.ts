import { CHECKPOINT_IDENTITY } from '../../../../common/identifiers';
import {
  SkillLevel,
  SkillSourceType,
  EvidenceType,
  TargetSkillLevel,
  SkillIcon,
  SkillColor,
} from '../../persistence/enums/skill.enums';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  RECORD_ID,
  SKILL_COLORS,
  SKILL_ICONS,
  SOURCE_TYPES,
} from '../../persistence/enums/skill.enums';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class CategoryDto {
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  @Transform(trim)
  name?: string;
  @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(5000) description?: string;
  @ValidateIf((_, v) => v !== undefined) @IsIn(SKILL_ICONS) icon?: SkillIcon;
  @ValidateIf((_, v) => v !== undefined) @IsIn(SKILL_COLORS) color?: SkillColor;
  @ValidateIf((_, v) => v !== undefined) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}
export class AssociationDto {
  @IsEnum(SkillSourceType) sourceType!: SkillSourceType;
  @IsString() @MaxLength(150) sourceId!: string;
  @ValidateIf((_, v) => v !== undefined) @Matches(CHECKPOINT_IDENTITY) checkpointIdentity?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) targetLevel?: TargetSkillLevel | null;
}
export class SkillDto {
  @ValidateIf((_, v) => v !== undefined) @Matches(RECORD_ID) categoryId?: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  @Transform(trim)
  name?: string;
  @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(5000) description?: string;
  @ValidateIf((_, v) => v !== undefined) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @ValidateIf((_, v) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @Matches(RECORD_ID, { each: true })
  prerequisiteIds?: string[];
  @ValidateIf((_, v) => v !== undefined)
  @IsArray()
  @ArrayMaxSize(300)
  @ArrayUnique((r: AssociationDto) => r && r.sourceType + ':' + r.sourceId)
  @ValidateNested({ each: true })
  @Type(() => AssociationDto)
  associations?: AssociationDto[];
}
export class ProficiencyDto {
  @IsEnum(SkillLevel) @IsInt() @Min(0) @Max(4) level!: SkillLevel;
  @Equals(true) confirm!: boolean;
  @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(2000) justification?: string;
}
export class EvidenceDto {
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  @Transform(trim)
  title?: string;
  @ValidateIf((_, v) => v !== undefined) @IsEnum(EvidenceType) type?: EvidenceType;
  @ValidateIf((_, v) => v !== undefined) @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(2048) url?: string | null;
}

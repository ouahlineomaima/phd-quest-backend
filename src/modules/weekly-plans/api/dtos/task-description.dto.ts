import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export class TaskDescriptionDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(2000)
  description!: string;
}

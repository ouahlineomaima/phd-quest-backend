import { Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../config/environment';

export function localDateAt(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
@Injectable()
export class ApplicationClock {
  constructor(private readonly config: ConfigService<AppEnvironment, true>) {}
  get timezone() {
    return this.config.get('APP_TIMEZONE', { infer: true });
  }
  now() {
    return new Date();
  }
  dateAt(instant: Date) {
    return localDateAt(instant, this.timezone);
  }
}
@Module({ providers: [ApplicationClock], exports: [ApplicationClock] })
export class TimeModule {}

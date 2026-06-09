import { Module } from '@nestjs/common';
import { RemindersModule } from '../reminders/reminders.module';
import { PromissoryNotesService } from './promissory-notes.service';

@Module({
  imports: [RemindersModule],
  providers: [PromissoryNotesService],
  exports: [PromissoryNotesService],
})
export class PromissoryNotesModule {}

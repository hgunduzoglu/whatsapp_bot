import { Module } from '@nestjs/common';
import { RemindersModule } from '../reminders/reminders.module';
import { PromissoryNotesController } from './promissory-notes.controller';
import { PromissoryNotesService } from './promissory-notes.service';

@Module({
  imports: [RemindersModule],
  controllers: [PromissoryNotesController],
  providers: [PromissoryNotesService],
  exports: [PromissoryNotesService],
})
export class PromissoryNotesModule {}

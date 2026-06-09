import { Module } from '@nestjs/common';
import { PromissoryNotesService } from './promissory-notes.service';

@Module({
  providers: [PromissoryNotesService],
  exports: [PromissoryNotesService],
})
export class PromissoryNotesModule {}

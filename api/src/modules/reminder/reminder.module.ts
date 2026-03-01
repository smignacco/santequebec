import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { WebexModule } from '../webex/webex.module';
import { ReminderService } from './reminder.service';

@Module({
  imports: [PrismaModule, WebexModule],
  providers: [ReminderService],
  exports: [ReminderService]
})
export class ReminderModule {}

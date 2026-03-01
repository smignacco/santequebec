import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebexModule } from '../webex/webex.module';
import { ReminderModule } from '../reminder/reminder.module';
import { AdminController } from './admin.controller';

@Module({ imports: [JwtModule.register({}), WebexModule, ReminderModule], controllers: [AdminController] })
export class AdminModule {}

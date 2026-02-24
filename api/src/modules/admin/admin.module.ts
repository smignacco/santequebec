import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebexModule } from '../webex/webex.module';
import { AdminController } from './admin.controller';

@Module({ imports: [JwtModule.register({}), WebexModule], controllers: [AdminController] })
export class AdminModule {}

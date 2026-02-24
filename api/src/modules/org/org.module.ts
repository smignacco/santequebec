import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WebexModule } from '../webex/webex.module';
import { OrgController } from './org.controller';

@Module({ imports: [JwtModule.register({}), WebexModule], controllers: [OrgController] })
export class OrgModule {}

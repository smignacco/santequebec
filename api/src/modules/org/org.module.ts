import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrgController } from './org.controller';

@Module({ imports: [JwtModule.register({})], controllers: [OrgController] })
export class OrgModule {}

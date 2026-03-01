import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync } from 'fs';
import { join } from 'path';
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PublicModule } from './modules/public/public.module';
import { AdminModule } from './modules/admin/admin.module';
import { OrgModule } from './modules/org/org.module';
import { ReminderModule } from './modules/reminder/reminder.module';

const localPublicPath = join(process.cwd(), 'public');
const containerPublicPath = join(process.cwd(), '..', 'public');
const staticAssetsPath = existsSync(localPublicPath) ? localPublicPath : containerPublicPath;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({ rootPath: staticAssetsPath, exclude: ['/api*'] }),
    PrismaModule,
    AuthModule,
    PublicModule,
    AdminModule,
    OrgModule,
    ReminderModule
  ]
})
export class AppModule {}

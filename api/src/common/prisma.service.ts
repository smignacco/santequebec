import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    await this.$executeRawUnsafe("PRAGMA journal_mode=WAL;");
    await this.$executeRawUnsafe("PRAGMA synchronous=NORMAL;");
    await this.$executeRawUnsafe("PRAGMA busy_timeout=5000;");
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}

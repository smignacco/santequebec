import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.connectWithRetry();
  }

  private async connectWithRetry() {
    const maxAttempts = Number(process.env.PRISMA_CONNECT_MAX_ATTEMPTS ?? 30);
    const retryDelayMs = Number(process.env.PRISMA_CONNECT_RETRY_DELAY_MS ?? 2000);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}

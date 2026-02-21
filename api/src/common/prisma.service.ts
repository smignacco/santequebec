import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

type SqliteTableColumn = {
  name: string;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly requiredSchema: Record<string, string[]> = {
    OrganizationType: ['id', 'code', 'label', 'createdAt', 'updatedAt'],
    Organization: ['id', 'orgCode', 'regionCode', 'displayName', 'isDrill', 'isActive', 'organizationTypeId', 'createdAt', 'updatedAt'],
    Batch: ['id', 'name', 'status', 'createdAt', 'updatedAt'],
    OrgAccess: ['id', 'organizationId', 'batchId', 'pinHash', 'isEnabled', 'expiresAt', 'createdAt', 'updatedAt'],
    InventoryFile: ['id', 'batchId', 'organizationId', 'sourceFilename', 'sourceChecksum', 'importedAt', 'rowCount', 'publishedColumns', 'status'],
    InventoryItem: ['id', 'inventoryFileId', 'rowNumber', 'assetTag', 'serial', 'model', 'site', 'location', 'notes', 'status', 'updatedAt'],
    AuditLog: ['id', 'scope', 'scopeId', 'actorType', 'actorName', 'actorEmail', 'action', 'detailsJson', 'createdAt']
  };

  async onModuleInit() {
    await this.$connect();
    await this.assertRequiredSchema();
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL;');
    await this.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
  }

  private async assertRequiredSchema() {
    const missing: string[] = [];

    for (const [table, columns] of Object.entries(this.requiredSchema)) {
      const tableColumns = await this.$queryRawUnsafe<SqliteTableColumn[]>(`PRAGMA table_info("${table}");`);
      if (!tableColumns.length) {
        missing.push(`${table} (table manquante)`);
        continue;
      }

      const existingColumns = new Set(tableColumns.map((column) => column.name));
      const missingColumns = columns.filter((column) => !existingColumns.has(column));

      if (missingColumns.length) {
        missing.push(`${table}: ${missingColumns.join(', ')}`);
      }
    }

    if (missing.length) {
      throw new Error(`Structure de base de données incompatible. Champs manquants: ${missing.join(' | ')}`);
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}

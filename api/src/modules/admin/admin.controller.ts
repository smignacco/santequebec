import { Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHash, randomInt } from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(req: any) { if (req.user?.role !== 'ADMIN') throw new UnauthorizedException(); }

  @Get('org-types')
  listTypes(@Req() req: any) { this.assertAdmin(req); return this.prisma.organizationType.findMany(); }
  @Post('org-types')
  createType(@Req() req: any, @Body() body: { code: string; label: string }) { this.assertAdmin(req); return this.prisma.organizationType.create({ data: body }); }
  @Patch('org-types/:id')
  updateType(@Req() req: any, @Param('id') id: string, @Body() body: { label: string }) { this.assertAdmin(req); return this.prisma.organizationType.update({ where: { id }, data: body }); }

  @Get('orgs')
  listOrgs(@Req() req: any) { this.assertAdmin(req); return this.prisma.organization.findMany({ include: { organizationType: true } }); }

  @Get('orgs/:orgId/details')
  async orgDetails(@Req() req: any, @Param('orgId') orgId: string) {
    this.assertAdmin(req);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, include: { organizationType: true } });
    const inventoryFiles = await this.prisma.inventoryFile.findMany({
      where: { organizationId: orgId },
      include: { batch: true, items: true },
      orderBy: { importedAt: 'desc' }
    });

    return {
      org,
      inventoryFiles: inventoryFiles.map((file: any) => ({
        id: file.id,
        name: file.batch?.name || file.sourceFilename,
        status: file.status,
        isLocked: file.isLocked,
        rowCount: file.rowCount,
        importedAt: file.importedAt,
        confirmedCount: file.items.filter((item: any) => item.status === 'CONFIRMED').length,
        pendingCount: file.items.filter((item: any) => item.status === 'PENDING').length
      }))
    };
  }

  @Get('inventory-files/:fileId/items')
  async inventoryItems(@Req() req: any, @Param('fileId') fileId: string) {
    this.assertAdmin(req);
    return this.prisma.inventoryItem.findMany({ where: { inventoryFileId: fileId }, orderBy: { rowNumber: 'asc' } });
  }

  @Get('inventory-files/:fileId/audit-logs')
  async inventoryAuditLogs(@Req() req: any, @Param('fileId') fileId: string) {
    this.assertAdmin(req);
    return this.prisma.auditLog.findMany({
      where: { scope: 'INVENTORY_FILE', scopeId: fileId },
      orderBy: { createdAt: 'desc' }
    });
  }

  @Patch('inventory-files/:fileId/publish')
  async publishInventory(@Req() req: any, @Param('fileId') fileId: string, @Body() body: { visibleColumns?: string[] }) {
    this.assertAdmin(req);
    const file = await this.prisma.inventoryFile.findUniqueOrThrow({ where: { id: fileId } });
    const existingPublished = await this.prisma.inventoryFile.findFirst({
      where: {
        organizationId: file.organizationId,
        status: 'PUBLISHED',
        id: { not: fileId }
      }
    });
    if (existingPublished) {
      throw new ConflictException('Une seule liste d\'inventaire peut être publiée à la fois pour cette organisation.');
    }
    const uniqueColumns = Array.from(new Set((body?.visibleColumns || []).filter((column) => typeof column === 'string' && column.trim().length > 0)));
    return this.prisma.inventoryFile.update({
      where: { id: fileId },
      data: {
        status: 'PUBLISHED',
        isLocked: false,
        publishedColumns: uniqueColumns.length ? JSON.stringify(uniqueColumns) : null
      }
    });
  }


  @Patch('inventory-files/:fileId/lock')
  async lockInventory(@Req() req: any, @Param('fileId') fileId: string) {
    this.assertAdmin(req);
    const file = await this.prisma.inventoryFile.update({ where: { id: fileId }, data: { isLocked: true } });
    await this.prisma.auditLog.create({ data: { scope: 'INVENTORY_FILE', scopeId: file.id, actorType: 'ADMIN', actorName: req.user.name, actorEmail: req.user.email, action: 'ADMIN_LOCK_INVENTORY', detailsJson: JSON.stringify({ isLocked: true }) } });
    return file;
  }

  @Patch('inventory-files/:fileId/unlock')
  async unlockInventory(@Req() req: any, @Param('fileId') fileId: string) {
    this.assertAdmin(req);
    const file = await this.prisma.inventoryFile.update({ where: { id: fileId }, data: { isLocked: false } });
    await this.prisma.auditLog.create({ data: { scope: 'INVENTORY_FILE', scopeId: file.id, actorType: 'ADMIN', actorName: req.user.name, actorEmail: req.user.email, action: 'ADMIN_UNLOCK_INVENTORY', detailsJson: JSON.stringify({ isLocked: false }) } });
    return file;
  }

  @Delete('inventory-items/:itemId')
  async removeInventoryItem(@Req() req: any, @Param('itemId') itemId: string) {
    this.assertAdmin(req);
    await this.prisma.inventoryItem.delete({ where: { id: itemId } });
    return { ok: true };
  }


  @Post('orgs')
  async createOrg(@Req() req: any, @Body() body: { orgCode: string; regionCode: string; displayName: string; supportContactEmail?: string | null; typeCode: string; isDrill?: boolean }) {
    this.assertAdmin(req);
    const normalizedTypeCode = (body.typeCode || 'CISSS').trim().toUpperCase();
    const type = await this.prisma.organizationType.upsert({
      where: { code: normalizedTypeCode },
      update: {},
      create: { code: normalizedTypeCode, label: normalizedTypeCode }
    });
    return this.prisma.organization.create({
      data: {
        orgCode: body.orgCode,
        regionCode: body.regionCode,
        displayName: body.displayName,
        supportContactEmail: body.supportContactEmail || null,
        isDrill: Boolean(body.isDrill),
        organizationTypeId: type.id,
        isActive: true
      },
      include: { organizationType: true }
    });
  }

  @Patch('orgs/:orgId/support-contact')
  async updateOrgSupportContact(@Req() req: any, @Param('orgId') orgId: string, @Body() body: { supportContactEmail?: string | null }) {
    this.assertAdmin(req);
    return this.prisma.organization.update({
      where: { id: orgId },
      data: { supportContactEmail: body.supportContactEmail || null },
      include: { organizationType: true }
    });
  }

  @Get('batches')
  listBatches(@Req() req: any) {
    this.assertAdmin(req);
    return this.prisma.batch.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('batches')
  createBatch(@Req() req: any, @Body() body: { name: string }) { this.assertAdmin(req); return this.prisma.batch.create({ data: { name: body.name, status: 'DRAFT' } }); }

  @Post('batches/:batchId/orgs/:orgId/access-pin')
  async resetPin(@Req() req: any, @Param('batchId') batchId: string, @Param('orgId') orgId: string, @Body() body?: { pin?: string }) {
    this.assertAdmin(req);
    const pin = (body?.pin || '').trim() || String(randomInt(100000, 999999));
    const pinHash = await argon2.hash(pin);
    await this.prisma.orgAccess.upsert({ where: { organizationId_batchId: { organizationId: orgId, batchId } }, update: { pinHash, isEnabled: true }, create: { organizationId: orgId, batchId, pinHash } });
    return { pin };
  }

  @Post('batches/:batchId/orgs/:orgId/import-excel')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@Req() req: any, @Param('batchId') batchId: string, @Param('orgId') orgId: string, @UploadedFile() file: Express.Multer.File) {
    this.assertAdmin(req);
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const inv = await this.prisma.inventoryFile.create({ data: { batchId, organizationId: orgId, sourceFilename: file.originalname, sourceChecksum: checksum, rowCount: rows.length, status: 'NOT_SUBMITTED' } });
    const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pick = (aliases: string[]) => {
        const key = Object.keys(row).find((k) => aliases.includes(norm(k)));
        const value = key ? row[key] : null;
        if (value === undefined || value === null || value === '') return null;
        return String(value);
      };

      const serialNumber = pick(['serialnumber', 'serial', 'numeroserie']);
      const productDescription = pick(['productdescription', 'model', 'modele']);

      await this.prisma.inventoryItem.create({
        data: {
          inventoryFileId: inv.id,
          rowNumber: i + 1,
          assetTag: pick(['assettag', 'tagactif']),
          serial: serialNumber,
          model: productDescription,
          site: pick(['site']),
          location: pick(['location', 'emplacement']),
          notes: pick(['notes', 'note']),
          serialNumber,
          productId: pick(['productid']),
          productDescription,
          major: pick(['major']),
          productType: pick(['producttype']),
          productFamily: pick(['productfamily']),
          architecture: pick(['architecture']),
          subArchitecture: pick(['subarchitecture']),
          quantity: pick(['quantity']),
          ldos: pick(['ldos']),
          ldosDetailsInMonths: pick(['ldosdetailsinmonths']),
          centreDeSanteRegional: pick(['centredesanteregional']),
          serviceableFlag: pick(['serviceableflag']),
          contractNumber: pick(['contractnumber']),
          serviceLevel: pick(['servicelevel']),
          serviceLevelDescription: pick(['serviceleveldescription']),
          serviceStartDate: pick(['servicestartdate']),
          serviceEndDate: pick(['serviceenddate']),
          globalServiceList: pick(['globalservicelist']),
          excludedAsset: pick(['excludedasset']),
          status: 'PENDING'
        }
      });
    }
    return { inventoryFileId: inv.id, rowCount: rows.length };
  }

  @Get('dashboard')
  async dashboard(@Req() req: any, @Query('batchId') batchId: string) {
    this.assertAdmin(req);
    const files = await this.prisma.inventoryFile.findMany({ where: { batchId }, include: { organization: true, items: true } });
    return files.map((f: any) => ({
      org: f.organization.displayName,
      orgCode: f.organization.orgCode,
      total: f.items.length,
      confirmed: f.items.filter((i: any) => i.status === 'CONFIRMED').length,
      pending: f.items.filter((i: any) => i.status === 'PENDING').length,
      needs_clarification: f.items.filter((i: any) => i.status === 'NEEDS_CLARIFICATION').length,
      status: f.status
    }));
  }

  @Get('batches/:batchId/orgs/:orgId/export-excel')
  async exportExcel(@Req() req: any, @Param('batchId') batchId: string, @Param('orgId') orgId: string) {
    this.assertAdmin(req);
    const inv = await this.prisma.inventoryFile.findFirstOrThrow({ where: { batchId, organizationId: orgId }, include: { items: true } });
    const data = inv.items.map((i: any) => ({ assetTag: i.assetTag, serial: i.serial, model: i.model, site: i.site, location: i.location, notes: i.notes, status: i.status }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return { filename: `inventory-${orgId}.xlsx`, contentBase64: buffer.toString('base64') };
  }

  @Get('batches/:batchId/orgs/:orgId/export-pdf')
  exportPdf() {
    return { statusCode: 501, message: 'PDF export not implemented yet' };
  }
}

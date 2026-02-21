import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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

  @Post('batches')
  createBatch(@Req() req: any, @Body() body: { name: string }) { this.assertAdmin(req); return this.prisma.batch.create({ data: { name: body.name, status: 'DRAFT' } }); }

  @Post('batches/:batchId/orgs/:orgId/access-pin')
  async resetPin(@Req() req: any, @Param('batchId') batchId: string, @Param('orgId') orgId: string) {
    this.assertAdmin(req);
    const pin = String(randomInt(100000, 999999));
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
    const norm = (k: string) => k.toLowerCase().replace(/\s+/g, '');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pick = (aliases: string[]) => {
        const key = Object.keys(row).find((k) => aliases.includes(norm(k)));
        return key ? String(row[key] ?? '') : null;
      };
      await this.prisma.inventoryItem.create({ data: { inventoryFileId: inv.id, rowNumber: i + 1, assetTag: pick(['assettag', 'tagactif']), serial: pick(['serial', 'numeroserie']), model: pick(['model', 'modele']), site: pick(['site']), location: pick(['location', 'emplacement']), notes: pick(['notes', 'note']), status: 'PENDING' } });
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

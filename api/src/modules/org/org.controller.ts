import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/org')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private prisma: PrismaService) {}
  private assertOrg(req: any) { if (req.user?.role !== 'ORG_USER') throw new UnauthorizedException(); }

  private getAuditContext(req: any) {
    const forwardedFor = req.headers?.['x-forwarded-for'];
    const ip = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : req.ip || req.socket?.remoteAddress || null;

    return {
      ipAddress: ip,
      userAgent: req.headers?.['user-agent'] || null,
      submittedAt: new Date().toISOString()
    };
  }

  @Get('me')
  async me(@Req() req: any) {
    this.assertOrg(req);
    return this.prisma.organization.findUnique({ where: { id: req.user.organizationId }, include: { organizationType: true } });
  }

  @Get('items')
  async items(@Req() req: any, @Query('status') status?: string, @Query('q') q = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    this.assertOrg(req);
    const p = Number(page), ps = Number(pageSize);
    const file = await this.prisma.inventoryFile.findFirst({
      where: { organizationId: req.user.organizationId, status: { in: ['PUBLISHED', 'SUBMITTED', 'CONFIRMED'] } },
      orderBy: { importedAt: 'desc' }
    });
    if (!file) return { total: 0, confirmed: 0, items: [], visibleColumns: [], fileStatus: null, isLocked: false };
    const where: any = { inventoryFileId: file.id };
    if (status) where.status = status;
    if (q) where.OR = [{ assetTag: { contains: q } }, { serial: { contains: q } }, { model: { contains: q } }, { site: { contains: q } }, { location: { contains: q } }];
    const total = await this.prisma.inventoryItem.count({ where });
    const confirmed = await this.prisma.inventoryItem.count({ where: { ...where, status: 'CONFIRMED' } });
    const items = await this.prisma.inventoryItem.findMany({ where, skip: (p - 1) * ps, take: ps, orderBy: { rowNumber: 'asc' } });

    let visibleColumns: string[] = [];
    if (file.publishedColumns) {
      try {
        const parsed = JSON.parse(file.publishedColumns);
        if (Array.isArray(parsed)) {
          visibleColumns = parsed.filter((column) => typeof column === 'string' && column.trim().length > 0);
        }
      } catch {
        visibleColumns = [];
      }
    }

    return { total, confirmed, page: p, pageSize: ps, items, visibleColumns, fileStatus: file.status, isLocked: file.isLocked };
  }

  @Patch('items/:id')
  async updateItem(@Req() req: any, @Param('id') id: string, @Body() body: { status?: string; notes?: string }) {
    this.assertOrg(req);
    const oldItem = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id }, include: { inventoryFile: true } });
    if (oldItem.inventoryFile.organizationId !== req.user.organizationId) throw new UnauthorizedException();
    if (oldItem.inventoryFile.isLocked) throw new UnauthorizedException('Inventaire verrouillé par un administrateur.');
    const item = await this.prisma.inventoryItem.update({ where: { id }, data: { status: body.status, notes: body.notes } });
    await this.prisma.auditLog.create({ data: { scope: 'INVENTORY_ITEM', scopeId: id, actorType: 'ORG_USER', actorName: req.user.name, actorEmail: req.user.email, action: 'ITEM_STATUS_CHANGED', detailsJson: JSON.stringify({ old: oldItem, new: item }) } });
    return item;
  }

  @Post('submit')
  async submit(@Req() req: any) {
    this.assertOrg(req);
    const inv = await this.prisma.inventoryFile.findFirstOrThrow({
      where: { organizationId: req.user.organizationId, status: { in: ['PUBLISHED', 'SUBMITTED'] }, isLocked: false },
      orderBy: { importedAt: 'desc' }
    });
    const file = await this.prisma.inventoryFile.update({ where: { id: inv.id }, data: { status: 'CONFIRMED' } });
    await this.prisma.auditLog.create({ data: { scope: 'INVENTORY_FILE', scopeId: file.id, actorType: 'ORG_USER', actorName: req.user.name, actorEmail: req.user.email, action: 'ORG_SUBMIT', detailsJson: JSON.stringify({ status: file.status, ...this.getAuditContext(req) }) } });
    return file;
  }

  @Post('resume-validation')
  async resumeValidation(@Req() req: any) {
    this.assertOrg(req);
    const inv = await this.prisma.inventoryFile.findFirstOrThrow({
      where: { organizationId: req.user.organizationId, status: 'CONFIRMED', isLocked: false },
      orderBy: { importedAt: 'desc' }
    });
    const file = await this.prisma.inventoryFile.update({ where: { id: inv.id }, data: { status: 'PUBLISHED' } });
    await this.prisma.auditLog.create({ data: { scope: 'INVENTORY_FILE', scopeId: file.id, actorType: 'ORG_USER', actorName: req.user.name, actorEmail: req.user.email, action: 'ORG_RESUME_VALIDATION', detailsJson: JSON.stringify({ status: file.status, ...this.getAuditContext(req) }) } });
    return file;
  }

  @Post('confirm-serial-list')
  async confirmSerialList(@Req() req: any, @Body() body: { serials?: string[] }) {
    this.assertOrg(req);

    const inv = await this.prisma.inventoryFile.findFirstOrThrow({
      where: { organizationId: req.user.organizationId, status: { in: ['PUBLISHED', 'SUBMITTED', 'CONFIRMED'] }, isLocked: false },
      orderBy: { importedAt: 'desc' }
    });

    const normalizedSerials = Array.from(new Set((body.serials || [])
      .map((serial) => (typeof serial === 'string' ? serial.trim() : ''))
      .filter(Boolean)));

    if (!normalizedSerials.length) {
      return { processed: 0, matched: 0, created: 0 };
    }

    const existingItems = await this.prisma.inventoryItem.findMany({
      where: { inventoryFileId: inv.id },
      orderBy: { rowNumber: 'asc' }
    });

    const serialIndex = new Map<string, any>();
    for (const item of existingItems) {
      const key = (item.serial || '').trim().toLowerCase();
      if (key && !serialIndex.has(key)) {
        serialIndex.set(key, item);
      }
    }

    let maxRowNumber = existingItems.reduce((max, item) => Math.max(max, item.rowNumber || 0), 0);
    const toUpdate: string[] = [];
    const toCreate: { rowNumber: number; serial: string }[] = [];

    for (const serial of normalizedSerials) {
      const matchedItem = serialIndex.get(serial.toLowerCase());
      if (matchedItem) {
        toUpdate.push(matchedItem.id);
        continue;
      }
      maxRowNumber += 1;
      toCreate.push({ rowNumber: maxRowNumber, serial });
    }

    if (toUpdate.length) {
      await this.prisma.inventoryItem.updateMany({
        where: { id: { in: toUpdate } },
        data: { status: 'CONFIRMED' }
      });
    }

    for (const item of toCreate) {
      await this.prisma.inventoryItem.create({
        data: {
          inventoryFileId: inv.id,
          rowNumber: item.rowNumber,
          serial: item.serial,
          serialNumber: item.serial,
          productDescription: 'Ajouté manuellement',
          notes: 'Ajouté manuellement',
          status: 'CONFIRMED'
        }
      });
    }

    if (toCreate.length) {
      await this.prisma.inventoryFile.update({ where: { id: inv.id }, data: { rowCount: { increment: toCreate.length } } });
    }

    await this.prisma.auditLog.create({
      data: {
        scope: 'INVENTORY_FILE',
        scopeId: inv.id,
        actorType: 'ORG_USER',
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'ORG_CONFIRM_SERIAL_LIST',
        detailsJson: JSON.stringify({
          processed: normalizedSerials.length,
          matched: toUpdate.length,
          created: toCreate.length,
          ...this.getAuditContext(req)
        })
      }
    });

    return { processed: normalizedSerials.length, matched: toUpdate.length, created: toCreate.length };
  }
}

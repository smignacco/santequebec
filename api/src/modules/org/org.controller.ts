import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';

@Controller('api/org')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private prisma: PrismaService) {}
  private assertOrg(req: any) { if (req.user?.role !== 'ORG_USER') throw new UnauthorizedException(); }
  private static readonly MANUAL_EDITABLE_FIELDS = ['serial', 'serialNumber', 'productId', 'productDescription'] as const;

  private ensureInventoryEditable(inventoryFile: { isLocked: boolean; status: string }) {
    if (inventoryFile.isLocked) {
      throw new UnauthorizedException('Inventaire verrouillé par un administrateur.');
    }

    if (inventoryFile.status === 'CONFIRMED') {
      throw new UnauthorizedException('Inventaire soumis. Utilisez "Remettre en cours de validation" pour modifier.');
    }
  }

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


  @Get('welcome-video')
  async welcomeVideo(@Req() req: any) {
    this.assertOrg(req);
    const [org, settings] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: req.user.organizationId } }),
      this.prisma.appSettings.findUnique({ where: { id: 'global' } })
    ]);

    const configuredUrl = settings?.welcomeVideoUrl || '';
    const isUploadedFile = /^\/uploads\/welcome-video\/.+\.mp4(\?.*)?$/i.test(configuredUrl);

    return {
      welcomeVideoUrl: isUploadedFile ? '/api/org/welcome-video/file' : configuredUrl,
      dismissed: Boolean(org.welcomeVideoDismissed)
    };
  }


  @Get('welcome-video/file')
  async welcomeVideoFile(@Req() req: any, @Res() res: any) {
    this.assertOrg(req);

    const settings = await this.prisma.appSettings.findUnique({ where: { id: 'global' } });
    const configuredUrl = settings?.welcomeVideoUrl || '';

    let parsed: URL;
    try {
      parsed = new URL(configuredUrl, 'http://localhost');
    } catch {
      throw new NotFoundException('Vidéo explicative introuvable.');
    }

    const pathMatch = parsed.pathname.match(/^\/uploads\/welcome-video\/(welcome-video-[\w-]+\.mp4)$/i);
    if (!pathMatch) {
      throw new NotFoundException('Vidéo explicative introuvable.');
    }

    const filename = pathMatch[1];
    const fullPath = join(process.cwd(), 'public', 'uploads', 'welcome-video', filename);

    if (!existsSync(fullPath)) {
      throw new NotFoundException('Vidéo explicative introuvable.');
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    const stream = createReadStream(fullPath);
    stream.pipe(res);
  }

  @Patch('welcome-video/dismiss')
  async dismissWelcomeVideo(@Req() req: any, @Body() body: { dismissed?: boolean }) {
    this.assertOrg(req);
    const dismissed = body.dismissed !== false;
    await this.prisma.organization.update({
      where: { id: req.user.organizationId },
      data: { welcomeVideoDismissed: dismissed }
    });

    return { dismissed };
  }

  @Get('items')
  async items(@Req() req: any, @Query('status') status?: string, @Query('q') q = '', @Query('page') page = '1', @Query('pageSize') pageSize = '20', @Query('filters') filters?: string) {
    this.assertOrg(req);
    const p = Number(page), ps = Number(pageSize);
    const file = await this.prisma.inventoryFile.findFirst({
      where: { organizationId: req.user.organizationId, status: { in: ['PUBLISHED', 'SUBMITTED', 'CONFIRMED'] } },
      orderBy: { importedAt: 'desc' }
    });
    if (!file) return { total: 0, confirmed: 0, items: [], visibleColumns: [], fileStatus: null, isLocked: false };
    const baseWhere: any = { inventoryFileId: file.id };
    if (status) baseWhere.status = status;
    if (q) baseWhere.OR = [{ assetTag: { contains: q } }, { serial: { contains: q } }, { model: { contains: q } }, { site: { contains: q } }, { location: { contains: q } }];
    const where: any = { ...baseWhere };

    let parsedFilters: Record<string, string> = {};
    if (filters) {
      try {
        const raw = JSON.parse(filters);
        if (raw && typeof raw === 'object') {
          parsedFilters = Object.fromEntries(
            Object.entries(raw)
              .filter(([key, value]) => typeof key === 'string' && typeof value === 'string' && value.trim().length > 0)
              .map(([key, value]) => [key, String(value).trim()])
          );
        }
      } catch {
        parsedFilters = {};
      }
    }

    if (Object.keys(parsedFilters).length) {
      where.AND = Object.entries(parsedFilters).map(([column, value]) => ({ [column]: value }));
    }

    const total = await this.prisma.inventoryItem.count({ where: { inventoryFileId: file.id } });
    const confirmed = await this.prisma.inventoryItem.count({ where: { inventoryFileId: file.id, status: { in: ['CONFIRMED', 'TO_BE_REMOVED'] } } });
    const filteredTotal = await this.prisma.inventoryItem.count({ where });
    const items = await this.prisma.inventoryItem.findMany({ where, skip: (p - 1) * ps, take: ps, orderBy: { rowNumber: 'asc' } });

    const allItemsForFilters = await this.prisma.inventoryItem.findMany({ where: { inventoryFileId: file.id }, orderBy: { rowNumber: 'asc' } });
    const filterValuesByColumn: Record<string, string[]> = {};
    allItemsForFilters.forEach((item: any) => {
      Object.entries(item).forEach(([column, rawValue]) => {
        if (['id', 'inventoryFileId', 'updatedAt'].includes(column)) return;
        const value = String(rawValue ?? '').trim();
        if (!value) return;
        if (!filterValuesByColumn[column]) {
          filterValuesByColumn[column] = [];
        }
        if (!filterValuesByColumn[column].includes(value)) {
          filterValuesByColumn[column].push(value);
        }
      });
    });
    Object.keys(filterValuesByColumn).forEach((column) => {
      filterValuesByColumn[column].sort((a, b) => a.localeCompare(b));
    });

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

    return { total, confirmed, filteredTotal, page: p, pageSize: ps, items, visibleColumns, fileStatus: file.status, isLocked: file.isLocked, filterValuesByColumn };
  }

  @Patch('items')
  async updateItems(@Req() req: any, @Body() body: { ids?: string[]; status?: string }) {
    this.assertOrg(req);

    const ids = Array.from(new Set((body.ids || []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)));
    if (!ids.length || !body.status) {
      return { updated: 0 };
    }

    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: ids } },
      include: { inventoryFile: true }
    });

    const canUpdateIds = items
      .filter((item) => {
        if (item.inventoryFile.organizationId !== req.user.organizationId) return false;
        return !item.inventoryFile.isLocked && item.inventoryFile.status !== 'CONFIRMED';
      })
      .map((item) => item.id);

    if (!canUpdateIds.length) {
      return { updated: 0 };
    }

    const updated = await this.prisma.inventoryItem.updateMany({
      where: { id: { in: canUpdateIds } },
      data: { status: body.status }
    });

    await this.prisma.auditLog.create({
      data: {
        scope: 'INVENTORY_FILE',
        scopeId: items[0]?.inventoryFileId || req.user.organizationId,
        actorType: 'ORG_USER',
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'ITEM_STATUS_BULK_CHANGED',
        detailsJson: JSON.stringify({ ids: canUpdateIds, status: body.status, ...this.getAuditContext(req) })
      }
    });

    return { updated: updated.count };
  }

  @Patch('items/:id')
  async updateItem(@Req() req: any, @Param('id') id: string, @Body() body: { status?: string; notes?: string }) {
    this.assertOrg(req);
    const oldItem = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id }, include: { inventoryFile: true } });
    if (oldItem.inventoryFile.organizationId !== req.user.organizationId) throw new UnauthorizedException();
    this.ensureInventoryEditable(oldItem.inventoryFile);
    const item = await this.prisma.inventoryItem.update({ where: { id }, data: { status: body.status, notes: body.notes } });
    await this.prisma.auditLog.create({ data: { scope: 'INVENTORY_ITEM', scopeId: id, actorType: 'ORG_USER', actorName: req.user.name, actorEmail: req.user.email, action: 'ITEM_STATUS_CHANGED', detailsJson: JSON.stringify({ old: oldItem, new: item }) } });
    return item;
  }

  @Patch('items/:id/manual-fields')
  async updateManualItemFields(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { serialNumber?: string; productId?: string; productDescription?: string }
  ) {
    this.assertOrg(req);
    const oldItem = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id }, include: { inventoryFile: true } });
    if (oldItem.inventoryFile.organizationId !== req.user.organizationId) throw new UnauthorizedException();
    this.ensureInventoryEditable(oldItem.inventoryFile);
    if (!oldItem.manualEntry) throw new UnauthorizedException('Seuls les items ajoutés manuellement sont modifiables.');

    const normalize = (value?: string) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    };

    const serialNumber = normalize(body.serialNumber);
    if (serialNumber === null) {
      throw new UnauthorizedException('Le numéro de série est obligatoire.');
    }

    const data = {
      serial: typeof serialNumber === 'string' ? serialNumber : oldItem.serial,
      serialNumber: typeof serialNumber === 'string' ? serialNumber : oldItem.serialNumber,
      productId: normalize(body.productId),
      productDescription: normalize(body.productDescription)
    };

    const item = await this.prisma.inventoryItem.update({ where: { id }, data });
    await this.prisma.auditLog.create({
      data: {
        scope: 'INVENTORY_ITEM',
        scopeId: id,
        actorType: 'ORG_USER',
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'MANUAL_ITEM_EDITED',
        detailsJson: JSON.stringify({ old: oldItem, new: item, updatedFields: OrgController.MANUAL_EDITABLE_FIELDS })
      }
    });
    return item;
  }

  @Post('items/manual')
  async addManualItem(
    @Req() req: any,
    @Body() body: { serialNumber?: string; productId?: string; productDescription?: string }
  ) {
    this.assertOrg(req);

    const inv = await this.prisma.inventoryFile.findFirstOrThrow({
      where: { organizationId: req.user.organizationId, status: { in: ['PUBLISHED', 'SUBMITTED'] }, isLocked: false },
      orderBy: { importedAt: 'desc' }
    });

    const serialNumber = typeof body.serialNumber === 'string' ? body.serialNumber.trim() : '';
    if (!serialNumber) {
      throw new UnauthorizedException('Le numéro de série est obligatoire.');
    }

    const maxRow = await this.prisma.inventoryItem.aggregate({ where: { inventoryFileId: inv.id }, _max: { rowNumber: true } });
    const rowNumber = (maxRow._max.rowNumber || 0) + 1;

    const item = await this.prisma.inventoryItem.create({
      data: {
        inventoryFileId: inv.id,
        rowNumber,
        serial: serialNumber,
        serialNumber,
        productId: typeof body.productId === 'string' && body.productId.trim() ? body.productId.trim() : null,
        productDescription: typeof body.productDescription === 'string' && body.productDescription.trim() ? body.productDescription.trim() : null,
        notes: 'Ajouté manuellement',
        status: 'CONFIRMED',
        manualEntry: true
      }
    });

    await this.prisma.inventoryFile.update({ where: { id: inv.id }, data: { rowCount: { increment: 1 } } });
    await this.prisma.auditLog.create({
      data: {
        scope: 'INVENTORY_FILE',
        scopeId: inv.id,
        actorType: 'ORG_USER',
        actorName: req.user.name,
        actorEmail: req.user.email,
        action: 'MANUAL_ITEM_ADDED',
        detailsJson: JSON.stringify({ itemId: item.id, ...this.getAuditContext(req) })
      }
    });
    return item;
  }

  @Post('submit')
  async submit(@Req() req: any) {
    this.assertOrg(req);
    const inv = await this.prisma.inventoryFile.findFirstOrThrow({
      where: { organizationId: req.user.organizationId, status: { in: ['PUBLISHED', 'SUBMITTED'] }, isLocked: false },
      orderBy: { importedAt: 'desc' }
    });
    const unvalidatedCount = await this.prisma.inventoryItem.count({
      where: {
        inventoryFileId: inv.id,
        status: { notIn: ['CONFIRMED', 'TO_BE_REMOVED'] }
      }
    });

    if (unvalidatedCount > 0) {
      throw new UnauthorizedException('Tous les éléments doivent être validés avant la soumission.');
    }

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
  async confirmSerialList(@Req() req: any, @Body() body: { rows?: Array<{ serialNumber?: string; productId?: string }> }) {
    this.assertOrg(req);

    const inv = await this.prisma.inventoryFile.findFirstOrThrow({
      where: { organizationId: req.user.organizationId, status: { in: ['PUBLISHED', 'SUBMITTED'] }, isLocked: false },
      orderBy: { importedAt: 'desc' }
    });

    const normalizedRows = (body.rows || [])
      .map((row) => ({
        serialNumber: typeof row?.serialNumber === 'string' ? row.serialNumber.trim() : '',
        productId: typeof row?.productId === 'string' ? row.productId.trim() : ''
      }))
      .filter((row) => Boolean(row.serialNumber));

    const dedupedRows = Array.from(new Map(
      normalizedRows.map((row) => [row.serialNumber.toLowerCase(), row])
    ).values());

    if (!dedupedRows.length) {
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
    const matchedRows: { id: string; productId: string }[] = [];
    const toCreate: { rowNumber: number; serial: string; productId: string | null }[] = [];

    for (const row of dedupedRows) {
      const matchedItem = serialIndex.get(row.serialNumber.toLowerCase());
      if (matchedItem) {
        matchedRows.push({ id: matchedItem.id, productId: row.productId });
        continue;
      }
      maxRowNumber += 1;
      toCreate.push({ rowNumber: maxRowNumber, serial: row.serialNumber, productId: row.productId || null });
    }

    for (const matched of matchedRows) {
      await this.prisma.inventoryItem.update({
        where: { id: matched.id },
        data: {
          status: 'CONFIRMED',
          ...(matched.productId ? { productId: matched.productId } : {})
        }
      });
    }

    for (const item of toCreate) {
      await this.prisma.inventoryItem.create({
        data: {
          inventoryFileId: inv.id,
          rowNumber: item.rowNumber,
          serial: item.serial,
          serialNumber: item.serial,
          productId: item.productId,
          productDescription: 'Ajouté manuellement',
          notes: 'Ajouté manuellement',
          status: 'CONFIRMED',
          manualEntry: true
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
          processed: dedupedRows.length,
          matched: matchedRows.length,
          created: toCreate.length,
          ...this.getAuditContext(req)
        })
      }
    });

    return { processed: dedupedRows.length, matched: matchedRows.length, created: toCreate.length };
  }
}

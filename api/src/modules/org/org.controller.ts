import { Body, Controller, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/org')
@UseGuards(JwtAuthGuard)
export class OrgController {
  constructor(private prisma: PrismaService) {}
  private assertOrg(req: any) { if (req.user?.role !== 'ORG_USER') throw new UnauthorizedException(); }

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
      where: { organizationId: req.user.organizationId, status: { in: ['PUBLISHED', 'SUBMITTED'] } },
      orderBy: { importedAt: 'desc' }
    });
    if (!file) return { total: 0, confirmed: 0, items: [], visibleColumns: [] };
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

    return { total, confirmed, page: p, pageSize: ps, items, visibleColumns };
  }

  @Patch('items/:id')
  async updateItem(@Req() req: any, @Param('id') id: string, @Body() body: { status?: string; notes?: string }) {
    this.assertOrg(req);
    const oldItem = await this.prisma.inventoryItem.findUniqueOrThrow({ where: { id } });
    const item = await this.prisma.inventoryItem.update({ where: { id }, data: { status: body.status, notes: body.notes } });
    await this.prisma.auditLog.create({ data: { scope: 'INVENTORY_ITEM', scopeId: id, actorType: 'ORG_USER', actorName: req.user.name, actorEmail: req.user.email, action: 'ITEM_STATUS_CHANGED', detailsJson: JSON.stringify({ old: oldItem, new: item }) } });
    return item;
  }

  @Post('submit')
  async submit(@Req() req: any) {
    this.assertOrg(req);
    const inv = await this.prisma.inventoryFile.findFirstOrThrow({
      where: { organizationId: req.user.organizationId, status: 'PUBLISHED' },
      orderBy: { importedAt: 'desc' }
    });
    const file = await this.prisma.inventoryFile.update({ where: { id: inv.id }, data: { status: 'SUBMITTED' } });
    await this.prisma.auditLog.create({ data: { scope: 'INVENTORY_FILE', scopeId: file.id, actorType: 'ORG_USER', actorName: req.user.name, actorEmail: req.user.email, action: 'ORG_SUBMIT', detailsJson: JSON.stringify({ status: file.status }) } });
    return file;
  }
}

import { Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { createHash, randomInt } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/prisma.service';
import { WebexService } from '../webex/webex.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReminderService } from '../reminder/reminder.service';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private prisma: PrismaService, private webexService: WebexService, private reminderService: ReminderService) {}
  private static readonly WELCOME_VIDEO_DIR = join(process.cwd(), 'public', 'uploads', 'welcome-video');
  private static readonly EXPORTABLE_INVENTORY_COLUMNS = [
    'rowNumber',
    'assetTag',
    'serial',
    'model',
    'site',
    'location',
    'notes',
    'instanceNumber',
    'serialNumber',
    'productId',
    'productDescription',
    'major',
    'productType',
    'productFamily',
    'architecture',
    'subArchitecture',
    'quantity',
    'ldos',
    'ldosDetailsInMonths',
    'centreDeSanteRegional',
    'serviceableFlag',
    'contractNumber',
    'serviceLevel',
    'serviceLevelDescription',
    'serviceStartDate',
    'serviceEndDate',
    'globalServiceList',
    'excludedAsset',
    'manualEntry',
    'status'
  ] as const;

  private assertAdmin(req: any) { if (req.user?.role !== 'ADMIN') throw new UnauthorizedException(); }

  private parseExcelRows(file: Express.Multer.File) {
    if (!file) {
      throw new ConflictException('Veuillez sélectionner un fichier Excel.');
    }

    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    return XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }

  private mapInventoryItemRow(row: Record<string, any>, rowNumber: number, inventoryFileId: string) {
    const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const pick = (aliases: string[]) => {
      const key = Object.keys(row).find((k) => aliases.includes(norm(k)));
      const value = key ? row[key] : null;
      if (value === undefined || value === null || value === '') return null;
      return String(value);
    };

    const serialNumber = pick(['serialnumber', 'serial', 'numeroserie']);
    const productDescription = pick(['productdescription', 'model', 'modele']);

    return {
      inventoryFileId,
      rowNumber,
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
    };
  }

  @Get('admin-users')
  listAdminUsers(@Req() req: any) {
    this.assertAdmin(req);
    return this.prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, username: true, email: true, displayName: true, isActive: true, createdAt: true }
    });
  }

  @Post('admin-users')
  async createAdminUser(@Req() req: any, @Body() body: { username: string; email: string; displayName: string; password: string }) {
    this.assertAdmin(req);
    const username = body.username?.trim();
    const email = body.email?.trim().toLowerCase();
    const displayName = body.displayName?.trim();
    const password = body.password || '';

    if (!username || !email || !displayName || password.length < 8) {
      throw new ConflictException('Informations administrateur invalides.');
    }

    const existing = await this.prisma.adminUser.findFirst({
      where: { OR: [{ username }, { email }] }
    });
    if (existing) throw new ConflictException('Un administrateur avec ce nom d\'utilisateur ou ce courriel existe déjà.');

    const passwordHash = await argon2.hash(password);
    return this.prisma.adminUser.create({
      data: { username, email, displayName, passwordHash, isActive: true },
      select: { id: true, username: true, email: true, displayName: true, isActive: true, createdAt: true }
    });
  }


  @Get('app-settings')
  async getAppSettings(@Req() req: any) {
    this.assertAdmin(req);
    const settings = await this.prisma.appSettings.findUnique({ where: { id: 'global' } });
    return {
      welcomeVideoUrl: settings?.welcomeVideoUrl || '',
      webexEnabled: Boolean(settings?.webexEnabled),
      webexBotToken: settings?.webexBotToken || '',
      webexRoomId: settings?.webexRoomId || '',
      webexNotifyOnSubmit: settings?.webexNotifyOnSubmit ?? true,
      webexNotifyOnHelp: settings?.webexNotifyOnHelp ?? true,
      webexNotifyOnLogin: settings?.webexNotifyOnLogin ?? false,
      webexNotifyOnReminder: settings?.webexNotifyOnReminder ?? true,
      reminderEmailEnabled: settings?.reminderEmailEnabled ?? true,
      reminderBusinessDays: settings?.reminderBusinessDays ?? 5,
      reminderFollowUpBusinessDays: settings?.reminderFollowUpBusinessDays ?? 5,
      reminderEmailSubjectTemplate: settings?.reminderEmailSubjectTemplate || '',
      reminderEmailTextTemplate: settings?.reminderEmailTextTemplate || '',
      reminderEmailHtmlTemplate: settings?.reminderEmailHtmlTemplate || ''
    };
  }

  @Post('app-settings/welcome-video-file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadWelcomeVideoFile(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    this.assertAdmin(req);

    if (!file) {
      throw new ConflictException('Veuillez sélectionner un fichier vidéo .mp4.');
    }

    const extension = extname(file.originalname || '').toLowerCase();
    const isMp4 = extension === '.mp4' || file.mimetype === 'video/mp4';
    if (!isMp4) {
      throw new ConflictException('Seuls les fichiers .mp4 sont acceptés.');
    }

    if (!existsSync(AdminController.WELCOME_VIDEO_DIR)) {
      mkdirSync(AdminController.WELCOME_VIDEO_DIR, { recursive: true });
    }

    const filename = `welcome-video-${Date.now()}.mp4`;
    const fullPath = join(AdminController.WELCOME_VIDEO_DIR, filename);
    writeFileSync(fullPath, file.buffer);

    const welcomeVideoUrl = `/uploads/welcome-video/${filename}`;
    const settings = await this.prisma.appSettings.upsert({
      where: { id: 'global' },
      update: { welcomeVideoUrl },
      create: { id: 'global', welcomeVideoUrl }
    });

    return { welcomeVideoUrl: settings.welcomeVideoUrl || '' };
  }


  @Patch('app-settings/webex')
  async updateWebexSettings(@Req() req: any, @Body() body: { webexEnabled?: boolean; webexBotToken?: string | null; webexRoomId?: string | null; webexNotifyOnSubmit?: boolean; webexNotifyOnHelp?: boolean; webexNotifyOnLogin?: boolean; webexNotifyOnReminder?: boolean; reminderEmailEnabled?: boolean; reminderBusinessDays?: number; reminderFollowUpBusinessDays?: number; reminderEmailSubjectTemplate?: string | null; reminderEmailTextTemplate?: string | null; reminderEmailHtmlTemplate?: string | null }) {
    this.assertAdmin(req);

    const webexBotToken = typeof body.webexBotToken === 'string' && body.webexBotToken.trim()
      ? body.webexBotToken.trim()
      : null;
    const webexRoomId = typeof body.webexRoomId === 'string' && body.webexRoomId.trim()
      ? body.webexRoomId.trim()
      : null;


    const reminderEmailSubjectTemplate = typeof body.reminderEmailSubjectTemplate === 'string' && body.reminderEmailSubjectTemplate.trim()
      ? body.reminderEmailSubjectTemplate.trim()
      : null;
    const reminderEmailTextTemplate = typeof body.reminderEmailTextTemplate === 'string' && body.reminderEmailTextTemplate.trim()
      ? body.reminderEmailTextTemplate.trim()
      : null;
    const reminderEmailHtmlTemplate = typeof body.reminderEmailHtmlTemplate === 'string' && body.reminderEmailHtmlTemplate.trim()
      ? body.reminderEmailHtmlTemplate.trim()
      : null;

    const settings = await this.prisma.appSettings.upsert({
      where: { id: 'global' },
      update: {
        webexEnabled: Boolean(body.webexEnabled),
        webexBotToken,
        webexRoomId,
        webexNotifyOnSubmit: body.webexNotifyOnSubmit !== false,
        webexNotifyOnHelp: body.webexNotifyOnHelp !== false,
        webexNotifyOnLogin: Boolean(body.webexNotifyOnLogin),
        webexNotifyOnReminder: body.webexNotifyOnReminder !== false,
        reminderEmailEnabled: body.reminderEmailEnabled !== false,
        reminderBusinessDays: Math.max(1, Number(body.reminderBusinessDays) || 5),
        reminderFollowUpBusinessDays: Math.max(1, Number(body.reminderFollowUpBusinessDays) || 5),
        reminderEmailSubjectTemplate,
        reminderEmailTextTemplate,
        reminderEmailHtmlTemplate
      },
      create: {
        id: 'global',
        webexEnabled: Boolean(body.webexEnabled),
        webexBotToken,
        webexRoomId,
        webexNotifyOnSubmit: body.webexNotifyOnSubmit !== false,
        webexNotifyOnHelp: body.webexNotifyOnHelp !== false,
        webexNotifyOnLogin: Boolean(body.webexNotifyOnLogin),
        webexNotifyOnReminder: body.webexNotifyOnReminder !== false,
        reminderEmailEnabled: body.reminderEmailEnabled !== false,
        reminderBusinessDays: Math.max(1, Number(body.reminderBusinessDays) || 5),
        reminderFollowUpBusinessDays: Math.max(1, Number(body.reminderFollowUpBusinessDays) || 5),
        reminderEmailSubjectTemplate,
        reminderEmailTextTemplate,
        reminderEmailHtmlTemplate
      }
    });

    return {
      webexEnabled: settings.webexEnabled,
      webexBotToken: settings.webexBotToken || '',
      webexRoomId: settings.webexRoomId || '',
      webexNotifyOnSubmit: settings.webexNotifyOnSubmit,
      webexNotifyOnHelp: settings.webexNotifyOnHelp,
      webexNotifyOnLogin: settings.webexNotifyOnLogin,
      webexNotifyOnReminder: settings.webexNotifyOnReminder,
      reminderEmailEnabled: settings.reminderEmailEnabled,
      reminderBusinessDays: settings.reminderBusinessDays,
      reminderFollowUpBusinessDays: settings.reminderFollowUpBusinessDays,
      reminderEmailSubjectTemplate: settings.reminderEmailSubjectTemplate || '',
      reminderEmailTextTemplate: settings.reminderEmailTextTemplate || '',
      reminderEmailHtmlTemplate: settings.reminderEmailHtmlTemplate || ''
    };
  }

  @Post('app-settings/webex/test')
  async testWebexSettings(@Req() req: any) {
    this.assertAdmin(req);
    return this.webexService.validateConnection();
  }

  @Get('app-settings/webex/spaces')
  async listWebexSpaces(@Req() req: any, @Query('botToken') botToken?: string) {
    this.assertAdmin(req);
    return this.webexService.listRooms(botToken);
  }

  @Get('reminders/pending-approvals')
  async listReminderPendingApprovals(@Req() req: any) {
    this.assertAdmin(req);
    return this.reminderService.listPendingApprovals();
  }

  @Get('reminders/:id/preview')
  async previewReminder(@Req() req: any, @Param('id') id: string) {
    this.assertAdmin(req);
    return this.reminderService.previewPendingReminder(id);
  }

  @Post('reminders/run-cycle')
  async runReminderCycle(@Req() req: any) {
    this.assertAdmin(req);
    return this.reminderService.runCycleManually({
      name: req.user?.name || 'Admin',
      email: req.user?.email || 'admin@santequebec.local'
    });
  }

  @Post('reminders/test-email')
  async sendReminderTestEmail(@Req() req: any, @Body() body: { recipientEmail?: string }) {
    this.assertAdmin(req);
    const recipientEmail = body?.recipientEmail?.trim().toLowerCase();

    if (!recipientEmail || !/^\S+@\S+\.\S+$/.test(recipientEmail)) {
      throw new ConflictException('Adresse courriel de test invalide.');
    }

    return this.reminderService.sendTestReminderEmail({
      recipientEmail,
      admin: {
        name: req.user?.name || 'Admin',
        email: req.user?.email || 'admin@santequebec.local'
      }
    });
  }

  @Post('reminders/:id/approve')
  async approveReminder(@Req() req: any, @Param('id') id: string) {
    this.assertAdmin(req);
    return this.reminderService.approveReminder(id, {
      name: req.user?.name || 'Admin',
      email: req.user?.email || 'admin@santequebec.local'
    });
  }

  @Post('reminders/:id/reject')
  async rejectReminder(@Req() req: any, @Param('id') id: string, @Body() body?: { reason?: string }) {
    this.assertAdmin(req);
    return this.reminderService.rejectReminder(id, {
      name: req.user?.name || 'Admin',
      email: req.user?.email || 'admin@santequebec.local'
    }, body?.reason);
  }

  @Patch('app-settings/welcome-video-url')
  async updateWelcomeVideoUrl(@Req() req: any, @Body() body: { welcomeVideoUrl?: string | null }) {
    this.assertAdmin(req);
    const welcomeVideoUrl = typeof body.welcomeVideoUrl === 'string' && body.welcomeVideoUrl.trim()
      ? body.welcomeVideoUrl.trim()
      : null;

    const settings = await this.prisma.appSettings.upsert({
      where: { id: 'global' },
      update: { welcomeVideoUrl },
      create: { id: 'global', welcomeVideoUrl }
    });

    return { welcomeVideoUrl: settings.welcomeVideoUrl || '' };
  }

  @Get('org-types')
  listTypes(@Req() req: any) { this.assertAdmin(req); return this.prisma.organizationType.findMany(); }
  @Post('org-types')
  createType(@Req() req: any, @Body() body: { code: string; label: string }) { this.assertAdmin(req); return this.prisma.organizationType.create({ data: body }); }
  @Patch('org-types/:id')
  updateType(@Req() req: any, @Param('id') id: string, @Body() body: { label: string }) { this.assertAdmin(req); return this.prisma.organizationType.update({ where: { id }, data: body }); }

  @Get('orgs')
  async listOrgs(@Req() req: any) {
    this.assertAdmin(req);
    const organizations = await this.prisma.organization.findMany({ include: { organizationType: true } });
    const orgIds = organizations.map((org) => org.id);

    const inventoryFiles = orgIds.length
      ? await this.prisma.inventoryFile.findMany({
          where: { organizationId: { in: orgIds } },
          select: { id: true, organizationId: true, status: true, importedAt: true, rowCount: true },
          orderBy: { importedAt: 'desc' }
        })
      : [];

    const loginCounts = orgIds.length
      ? await this.prisma.auditLog.groupBy({
          by: ['scopeId'],
          where: {
            scope: 'ORG_ACCESS',
            action: 'ORG_LOGIN',
            scopeId: { in: orgIds }
          },
          _count: { _all: true }
        })
      : [];

    const countByOrgId = new Map(loginCounts.map((entry) => [entry.scopeId, entry._count._all]));
    const validationStatuses = new Set(['PUBLISHED', 'SUBMITTED']);
    const inventoryStatsByOrgId = new Map<string, {
      inValidationCount: number;
      latestInventoryStatus: string | null;
      latestInventoryFileId: string | null;
      latestInventoryRowCount: number;
    }>();

    inventoryFiles.forEach((file) => {
      const existing = inventoryStatsByOrgId.get(file.organizationId);
      if (existing) {
        existing.inValidationCount += validationStatuses.has(file.status) ? 1 : 0;
        return;
      }

      inventoryStatsByOrgId.set(file.organizationId, {
        inValidationCount: validationStatuses.has(file.status) ? 1 : 0,
        latestInventoryStatus: file.status || null,
        latestInventoryFileId: file.id,
        latestInventoryRowCount: file.rowCount
      });
    });

    const latestInventoryFileIds = Array.from(inventoryStatsByOrgId.values())
      .map((entry) => entry.latestInventoryFileId)
      .filter((fileId): fileId is string => Boolean(fileId));

    const confirmedCountsByFileId = latestInventoryFileIds.length
      ? await this.prisma.inventoryItem.groupBy({
          by: ['inventoryFileId'],
          where: {
            inventoryFileId: { in: latestInventoryFileIds },
            status: 'CONFIRMED'
          },
          _count: { _all: true }
        })
      : [];

    const confirmedCountByFileId = new Map(confirmedCountsByFileId.map((entry) => [entry.inventoryFileId, entry._count._all]));

    return organizations.map((organization) => ({
      ...organization,
      loginCount: countByOrgId.get(organization.id) || 0,
      inValidationCount: inventoryStatsByOrgId.get(organization.id)?.inValidationCount || 0,
      latestInventoryStatus: inventoryStatsByOrgId.get(organization.id)?.latestInventoryStatus || null,
      latestInventoryRowCount: inventoryStatsByOrgId.get(organization.id)?.latestInventoryRowCount || 0,
      latestInventoryConfirmedCount: confirmedCountByFileId.get(inventoryStatsByOrgId.get(organization.id)?.latestInventoryFileId || '') || 0
    }));
  }

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

  @Get('orgs/:orgId/access-logs')
  async orgAccessLogs(@Req() req: any, @Param('orgId') orgId: string) {
    this.assertAdmin(req);
    return this.prisma.auditLog.findMany({
      where: { scope: 'ORG_ACCESS', scopeId: orgId, action: 'ORG_LOGIN' },
      orderBy: { createdAt: 'desc' }
    });
  }

  @Delete('orgs/:orgId/access-logs')
  async clearOrgAccessLogs(@Req() req: any, @Param('orgId') orgId: string) {
    this.assertAdmin(req);
    const result = await this.prisma.auditLog.deleteMany({
      where: { scope: 'ORG_ACCESS', scopeId: orgId, action: 'ORG_LOGIN' }
    });
    return { ok: true, deletedCount: result.count };
  }

  @Delete('inventory-files/:fileId')
  async removeInventoryFile(@Req() req: any, @Param('fileId') fileId: string) {
    this.assertAdmin(req);

    const [deletedItems, deletedLogs, deletedFiles] = await this.prisma.$transaction([
      this.prisma.inventoryItem.deleteMany({ where: { inventoryFileId: fileId } }),
      this.prisma.auditLog.deleteMany({ where: { scope: 'INVENTORY_FILE', scopeId: fileId } }),
      this.prisma.inventoryFile.deleteMany({ where: { id: fileId } })
    ]);

    return {
      ok: deletedFiles.count > 0,
      deletedInventoryFiles: deletedFiles.count,
      deletedInventoryItems: deletedItems.count,
      deletedAuditLogs: deletedLogs.count
    };
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
        reminderNotificationsEnabled: true,
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

  @Patch('orgs/:orgId/reminder-notifications')
  async updateOrgReminderNotifications(@Req() req: any, @Param('orgId') orgId: string, @Body() body: { reminderNotificationsEnabled?: boolean }) {
    this.assertAdmin(req);
    return this.prisma.organization.update({
      where: { id: orgId },
      data: { reminderNotificationsEnabled: body.reminderNotificationsEnabled !== false },
      include: { organizationType: true }
    });
  }

  @Patch('orgs/:orgId/org-code')
  async updateOrgCode(@Req() req: any, @Param('orgId') orgId: string, @Body() body: { orgCode: string }) {
    this.assertAdmin(req);
    const orgCode = (body?.orgCode || '').trim();
    if (!orgCode) {
      throw new ConflictException('Le code de l\'organisation est requis.');
    }

    const existing = await this.prisma.organization.findFirst({
      where: { orgCode, id: { not: orgId } },
      select: { id: true }
    });
    if (existing) {
      throw new ConflictException('Ce code d\'organisation est déjà utilisé.');
    }

    return this.prisma.organization.update({
      where: { id: orgId },
      data: { orgCode },
      include: { organizationType: true }
    });
  }

  @Patch('orgs/:orgId/access-pin')
  async updateOrgPin(@Req() req: any, @Param('orgId') orgId: string, @Body() body: { pin: string }) {
    this.assertAdmin(req);
    const pin = (body?.pin || '').trim();
    if (pin.length < 4) {
      throw new ConflictException('Le NIP doit contenir au moins 4 caractères.');
    }

    const pinHash = await argon2.hash(pin);
    const result = await this.prisma.orgAccess.updateMany({
      where: { organizationId: orgId },
      data: { pinHash, isEnabled: true }
    });

    if (result.count === 0) {
      throw new ConflictException('Aucun accès actif trouvé pour cette organisation. Veuillez publier un inventaire avant de modifier le NIP.');
    }

    await this.prisma.organization.update({
      where: { id: orgId },
      data: { loginPin: pin }
    });

    return { ok: true };
  }

  @Delete('orgs/:orgId')
  async removeOrg(@Req() req: any, @Param('orgId') orgId: string) {
    this.assertAdmin(req);

    const inventoryFiles = await this.prisma.inventoryFile.findMany({
      where: { organizationId: orgId },
      select: { id: true }
    });
    const inventoryFileIds = inventoryFiles.map((file) => file.id);

    const [deletedItemsResult, deletedLogsResult, deletedOrgAccessLogsResult, deletedFilesResult, deletedAccessResult] = await this.prisma.$transaction([
      this.prisma.inventoryItem.deleteMany({ where: { inventoryFileId: { in: inventoryFileIds } } }),
      this.prisma.auditLog.deleteMany({ where: { scope: 'INVENTORY_FILE', scopeId: { in: inventoryFileIds } } }),
      this.prisma.auditLog.deleteMany({ where: { scope: 'ORG_ACCESS', scopeId: orgId, action: 'ORG_LOGIN' } }),
      this.prisma.inventoryFile.deleteMany({ where: { organizationId: orgId } }),
      this.prisma.orgAccess.deleteMany({ where: { organizationId: orgId } })
    ]);

    await this.prisma.organization.delete({ where: { id: orgId } });

    return {
      ok: true,
      deletedInventoryFiles: deletedFilesResult.count,
      deletedInventoryItems: deletedItemsResult.count,
      deletedAuditLogs: deletedLogsResult.count + deletedOrgAccessLogsResult.count,
      deletedAccessLinks: deletedAccessResult.count
    };
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
    await this.prisma.organization.update({
      where: { id: orgId },
      data: { loginPin: pin }
    });
    return { pin };
  }

  @Post('batches/:batchId/orgs/:orgId/import-excel')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@Req() req: any, @Param('batchId') batchId: string, @Param('orgId') orgId: string, @UploadedFile() file: Express.Multer.File) {
    this.assertAdmin(req);
    const rows = this.parseExcelRows(file);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const inv = await this.prisma.inventoryFile.create({ data: { batchId, organizationId: orgId, sourceFilename: file.originalname, sourceChecksum: checksum, rowCount: rows.length, status: 'NOT_SUBMITTED' } });
    for (let i = 0; i < rows.length; i++) {
      await this.prisma.inventoryItem.create({
        data: this.mapInventoryItemRow(rows[i], i + 1, inv.id)
      });
    }
    return { inventoryFileId: inv.id, rowCount: rows.length };
  }

  @Post('inventory-files/:fileId/import-excel')
  @UseInterceptors(FileInterceptor('file'))
  async importExcelIntoExistingInventory(@Req() req: any, @Param('fileId') fileId: string, @UploadedFile() file: Express.Multer.File) {
    this.assertAdmin(req);
    const rows = this.parseExcelRows(file);
    const inventoryFile = await this.prisma.inventoryFile.findUniqueOrThrow({ where: { id: fileId } });
    const maxRow = await this.prisma.inventoryItem.aggregate({ where: { inventoryFileId: fileId }, _max: { rowNumber: true } });
    const startingRowNumber = (maxRow._max.rowNumber || 0) + 1;

    for (let i = 0; i < rows.length; i += 1) {
      await this.prisma.inventoryItem.create({
        data: this.mapInventoryItemRow(rows[i], startingRowNumber + i, fileId)
      });
    }

    const nextStatus = inventoryFile.status === 'CONFIRMED' ? 'PUBLISHED' : inventoryFile.status;
    await this.prisma.inventoryFile.update({
      where: { id: fileId },
      data: {
        rowCount: { increment: rows.length },
        status: nextStatus
      }
    });

    return { inventoryFileId: fileId, rowCount: rows.length, status: nextStatus };
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

  @Get('inventory-files/:fileId/export-excel')
  async exportExcel(@Req() req: any, @Param('fileId') fileId: string) {
    this.assertAdmin(req);
    const inv = await this.prisma.inventoryFile.findUniqueOrThrow({
      where: { id: fileId },
      include: {
        organization: true,
        batch: true,
        items: { orderBy: { rowNumber: 'asc' } }
      }
    });

    if (inv.status !== 'CONFIRMED') {
      throw new ConflictException('L\'export Excel est disponible uniquement pour un inventaire confirmé par l\'organisation.');
    }

    const data = inv.items.map((item: any) => {
      const row: Record<string, any> = {};
      for (const column of AdminController.EXPORTABLE_INVENTORY_COLUMNS) {
        const value = item[column];
        row[column] = value === null || value === undefined ? '' : value;
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const safeOrgCode = (inv.organization.orgCode || 'org').replace(/[^a-z0-9-_]/gi, '-');
    const safeBatchName = (inv.batch.name || 'inventaire').replace(/[^a-z0-9-_]/gi, '-');
    return { filename: `inventaire-${safeOrgCode}-${safeBatchName}.xlsx`, contentBase64: buffer.toString('base64') };
  }

  @Get('batches/:batchId/orgs/:orgId/export-pdf')
  exportPdf() {
    return { statusCode: 501, message: 'PDF export not implemented yet' };
  }
}

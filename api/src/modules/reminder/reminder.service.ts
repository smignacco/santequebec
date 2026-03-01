import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createConnection } from 'net';
import { PrismaService } from '../../common/prisma.service';
import { WebexService } from '../webex/webex.service';

@Injectable()
export class ReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private prisma: PrismaService, private webexService: WebexService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.runCycle().catch((error) => {
        this.logger.error(`Reminder cycle failed: ${(error as Error).message}`);
      });
    }, 60 * 60 * 1000);

    this.runCycle().catch((error) => {
      this.logger.error(`Initial reminder cycle failed: ${(error as Error).message}`);
    });
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private businessDaysBetween(start: Date, end: Date) {
    if (start >= end) return 0;
    const date = new Date(start);
    date.setHours(0, 0, 0, 0);
    const endDate = new Date(end);
    endDate.setHours(0, 0, 0, 0);

    let businessDays = 0;
    while (date < endDate) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) {
        businessDays += 1;
      }
    }

    return businessDays;
  }

  private async runCycle() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const settings = await this.prisma.appSettings.findUnique({ where: { id: 'global' } });
      if (!settings?.reminderEmailEnabled) {
        return;
      }

      const reminderBusinessDays = Math.max(1, settings.reminderBusinessDays || 1);
      const now = new Date();

      const organizations = await this.prisma.organization.findMany({
        where: { isActive: true, reminderNotificationsEnabled: true }
      });

      for (const organization of organizations) {
        const latestLogin = await this.prisma.auditLog.findFirst({
          where: {
            scope: 'ORG_ACCESS',
            scopeId: organization.id,
            action: 'ORG_LOGIN'
          },
          orderBy: { createdAt: 'desc' }
        });

        if (!latestLogin) continue;

        const elapsedBusinessDays = this.businessDaysBetween(latestLogin.createdAt, now);
        if (elapsedBusinessDays < reminderBusinessDays) continue;

        const latestPublished = await this.prisma.inventoryFile.findFirst({
          where: {
            organizationId: organization.id,
            status: 'PUBLISHED'
          },
          orderBy: { importedAt: 'desc' }
        });
        if (!latestPublished) continue;

        const existingRequest = await this.prisma.reminderApproval.findFirst({
          where: {
            inventoryFileId: latestPublished.id,
            loginAuditLogId: latestLogin.id,
            status: { in: ['PENDING_APPROVAL', 'APPROVED', 'SENT'] }
          }
        });
        if (existingRequest) continue;

        const [confirmedCount, totalCount] = await Promise.all([
          this.prisma.inventoryItem.count({ where: { inventoryFileId: latestPublished.id, status: 'CONFIRMED' } }),
          this.prisma.inventoryItem.count({ where: { inventoryFileId: latestPublished.id } })
        ]);

        const remainingCount = Math.max(totalCount - confirmedCount, 0);
        const recipient = latestLogin.actorEmail;
        if (!recipient) continue;

        await this.prisma.reminderApproval.create({
          data: {
            organizationId: organization.id,
            inventoryFileId: latestPublished.id,
            loginAuditLogId: latestLogin.id,
            recipientEmail: recipient,
            remainingCount,
            totalCount,
            status: 'PENDING_APPROVAL'
          }
        });

        await this.prisma.auditLog.create({
          data: {
            scope: 'INVENTORY_FILE',
            scopeId: latestPublished.id,
            actorType: 'SYSTEM',
            actorName: 'System Reminder',
            actorEmail: 'santequebec@cisco.com',
            action: 'ORG_REMINDER_QUEUED',
            detailsJson: JSON.stringify({
              to: recipient,
              organizationId: organization.id,
              elapsedBusinessDays,
              remainingCount,
              totalCount
            })
          }
        });
      }
    } finally {
      this.isRunning = false;
    }
  }

  async listPendingApprovals() {
    return this.prisma.reminderApproval.findMany({
      where: { status: 'PENDING_APPROVAL' },
      include: {
        organization: { select: { id: true, displayName: true, orgCode: true } },
        inventoryFile: { select: { id: true, status: true } }
      },
      orderBy: { requestedAt: 'asc' }
    });
  }

  async approveReminder(reminderId: string, admin: { name: string; email: string }) {
    const reminder = await this.prisma.reminderApproval.findUnique({
      where: { id: reminderId },
      include: { organization: true, inventoryFile: true }
    });

    if (!reminder || reminder.status !== 'PENDING_APPROVAL') {
      return { ok: false, message: 'Relance introuvable ou déjà traitée.' };
    }

    if (!reminder.organization.reminderNotificationsEnabled) {
      return { ok: false, message: 'Les relances sont désactivées pour cette organisation.' };
    }

    const settings = await this.prisma.appSettings.findUnique({ where: { id: 'global' } });
    if (!settings?.reminderEmailEnabled) {
      return { ok: false, message: 'Le module de relance courriel est désactivé globalement.' };
    }

    await this.sendReminderEmail({
      to: reminder.recipientEmail,
      organizationName: reminder.organization.displayName,
      remainingCount: reminder.remainingCount,
      totalCount: reminder.totalCount,
      supportContactEmail: reminder.organization.supportContactEmail || undefined
    });

    const now = new Date();
    await this.prisma.reminderApproval.update({
      where: { id: reminder.id },
      data: {
        status: 'SENT',
        approvedAt: now,
        approvedByName: admin.name,
        approvedByEmail: admin.email,
        sentAt: now
      }
    });

    await this.prisma.auditLog.create({
      data: {
        scope: 'INVENTORY_FILE',
        scopeId: reminder.inventoryFileId,
        actorType: 'ADMIN',
        actorName: admin.name,
        actorEmail: admin.email,
        action: 'ORG_REMINDER_SENT',
        detailsJson: JSON.stringify({
          reminderApprovalId: reminder.id,
          to: reminder.recipientEmail,
          remainingCount: reminder.remainingCount,
          totalCount: reminder.totalCount
        })
      }
    });

    await this.webexService.notifyReminderSent({
      orgName: reminder.organization.displayName,
      orgCode: reminder.organization.orgCode,
      recipient: reminder.recipientEmail,
      remainingCount: reminder.remainingCount,
      totalCount: reminder.totalCount,
      remindedAt: now.toISOString()
    });

    return { ok: true, message: 'Relance approuvée et envoyée.' };
  }

  async rejectReminder(reminderId: string, admin: { name: string; email: string }, reason?: string) {
    const reminder = await this.prisma.reminderApproval.findUnique({ where: { id: reminderId } });
    if (!reminder || reminder.status !== 'PENDING_APPROVAL') {
      return { ok: false, message: 'Relance introuvable ou déjà traitée.' };
    }

    const now = new Date();
    await this.prisma.reminderApproval.update({
      where: { id: reminder.id },
      data: {
        status: 'REJECTED',
        rejectedAt: now,
        rejectedByName: admin.name,
        rejectedByEmail: admin.email,
        rejectionReason: reason?.trim() || null
      }
    });

    await this.prisma.auditLog.create({
      data: {
        scope: 'INVENTORY_FILE',
        scopeId: reminder.inventoryFileId,
        actorType: 'ADMIN',
        actorName: admin.name,
        actorEmail: admin.email,
        action: 'ORG_REMINDER_REJECTED',
        detailsJson: JSON.stringify({ reminderApprovalId: reminder.id, rejectionReason: reason?.trim() || null })
      }
    });

    return { ok: true, message: 'Relance rejetée.' };
  }

  private async sendReminderEmail(payload: { to: string; organizationName: string; remainingCount: number; totalCount: number; supportContactEmail?: string }) {
    const supportContactLine = payload.supportContactEmail
      ? `Pour de l'assistance, joignez-nous via MS Teams: ${payload.supportContactEmail}.`
      : "Pour de l'assistance, utilisez le lien MS Teams de votre organisation.";

    const subject = `Relance - Inventaire ${payload.organizationName} en cours de validation`;
    const body = [
      'Bonjour,',
      '',
      `L'inventaire de l'organisation ${payload.organizationName} est toujours en cours de validation.`,
      `Il reste ${payload.remainingCount} éléments sur ${payload.totalCount} éléments à valider.`,
      '',
      supportContactLine,
      '',
      'Merci.'
    ].join('\r\n');

    await this.sendSmtpMail({
      host: 'outbound.cisco.com',
      port: 25,
      from: 'santequebec@cisco.com',
      to: payload.to,
      subject,
      body
    });
  }

  private async sendSmtpMail(input: { host: string; port: number; from: string; to: string; subject: string; body: string }) {
    const socket = createConnection({ host: input.host, port: input.port });

    const readResponse = async () => {
      const chunk = await new Promise<string>((resolve, reject) => {
        const onData = (data: Buffer) => {
          cleanup();
          resolve(data.toString('utf8'));
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const onTimeout = () => {
          cleanup();
          reject(new Error('SMTP timeout'));
        };

        const cleanup = () => {
          socket.off('data', onData);
          socket.off('error', onError);
          socket.off('timeout', onTimeout);
        };

        socket.once('data', onData);
        socket.once('error', onError);
        socket.once('timeout', onTimeout);
      });

      const code = Number(chunk.slice(0, 3));
      if (Number.isNaN(code) || code >= 400) {
        throw new Error(`SMTP error response: ${chunk.trim()}`);
      }
      return chunk;
    };

    const sendLine = async (line: string) => {
      await new Promise<void>((resolve, reject) => {
        socket.write(`${line}\r\n`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await readResponse();
    };

    try {
      socket.setTimeout(15000);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('error', reject);
      });
      await readResponse();
      await sendLine('HELO santequebec.local');
      await sendLine(`MAIL FROM:<${input.from}>`);
      await sendLine(`RCPT TO:<${input.to}>`);
      await sendLine('DATA');

      const message = [
        `From: ${input.from}`,
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        input.body,
        '.',
        ''
      ].join('\r\n');

      await new Promise<void>((resolve, reject) => {
        socket.write(message, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await readResponse();
      await sendLine('QUIT');
    } finally {
      if (!socket.destroyed) {
        socket.end();
      }
    }
  }
}

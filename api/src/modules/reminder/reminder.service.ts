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
    if (this.isRunning) {
      return { queuedCount: 0, skippedBecauseAlreadyRunning: true };
    }
    this.isRunning = true;
    let queuedCount = 0;

    try {
      const settings = await this.prisma.appSettings.findUnique({ where: { id: 'global' } });
      if (!settings?.reminderEmailEnabled) {
        return { queuedCount: 0, skippedBecauseAlreadyRunning: false };
      }

      const reminderBusinessDays = Math.max(1, settings.reminderBusinessDays || 1);
      const reminderFollowUpBusinessDays = Math.max(1, settings.reminderFollowUpBusinessDays || 1);
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

        if (!latestLogin?.actorEmail) continue;

        const latestPendingInventory = await this.prisma.inventoryFile.findFirst({
          where: {
            organizationId: organization.id,
            status: { in: ['NOT_SUBMITTED', 'PUBLISHED'] }
          },
          orderBy: { importedAt: 'desc' }
        });
        if (!latestPendingInventory) continue;

        const latestReminder = await this.prisma.reminderApproval.findFirst({
          where: {
            inventoryFileId: latestPendingInventory.id,
            recipientEmail: latestLogin.actorEmail,
            status: { in: ['PENDING_APPROVAL', 'APPROVED', 'SENT'] }
          },
          orderBy: { requestedAt: 'desc' }
        });

        if (latestReminder?.status === 'PENDING_APPROVAL') continue;

        const referenceDate = latestReminder
          ? (latestReminder.sentAt || latestReminder.approvedAt || latestReminder.requestedAt)
          : latestLogin.createdAt;
        const requiredBusinessDays = latestReminder ? reminderFollowUpBusinessDays : reminderBusinessDays;
        const elapsedBusinessDays = this.businessDaysBetween(referenceDate, now);
        if (elapsedBusinessDays < requiredBusinessDays) continue;

        const [confirmedCount, totalCount] = await Promise.all([
          this.prisma.inventoryItem.count({ where: { inventoryFileId: latestPendingInventory.id, status: 'CONFIRMED' } }),
          this.prisma.inventoryItem.count({ where: { inventoryFileId: latestPendingInventory.id } })
        ]);

        const remainingCount = Math.max(totalCount - confirmedCount, 0);
        const recipient = latestLogin.actorEmail;

        await this.prisma.reminderApproval.create({
          data: {
            organizationId: organization.id,
            inventoryFileId: latestPendingInventory.id,
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
            scopeId: latestPendingInventory.id,
            actorType: 'SYSTEM',
            actorName: 'System Reminder',
            actorEmail: 'santequebec@cisco.com',
            action: 'ORG_REMINDER_QUEUED',
            detailsJson: JSON.stringify({
              to: recipient,
              organizationId: organization.id,
              elapsedBusinessDays,
              requiredBusinessDays,
              isFollowUpReminder: Boolean(latestReminder),
              remainingCount,
              totalCount
            })
          }
        });

        queuedCount += 1;
      }

      return { queuedCount, skippedBecauseAlreadyRunning: false };
    } finally {
      this.isRunning = false;
    }
  }


  async runCycleManually(admin: { name: string; email: string }) {
    const result = await this.runCycle();
    if (result.skippedBecauseAlreadyRunning) {
      return {
        ok: false,
        message: 'Un cycle de relance est déjà en cours. Réessayez dans quelques instants.',
        queuedCount: 0
      };
    }

    await this.prisma.auditLog.create({
      data: {
        scope: 'APP_SETTINGS',
        scopeId: 'global',
        actorType: 'ADMIN',
        actorName: admin.name,
        actorEmail: admin.email,
        action: 'ORG_REMINDER_CYCLE_TRIGGERED',
        detailsJson: JSON.stringify({ queuedCount: result.queuedCount })
      }
    });

    return {
      ok: true,
      message: result.queuedCount > 0
        ? `${result.queuedCount} relance(s) ajoutée(s) à la file d'approbation.`
        : 'Cycle exécuté. Aucune nouvelle relance à approuver pour les paramètres actuels.',
      queuedCount: result.queuedCount
    };
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

  async sendTestReminderEmail(input: { recipientEmail: string; admin: { name: string; email: string } }) {
    const recipientEmail = input.recipientEmail.trim().toLowerCase();

    await this.sendReminderEmail({
      to: recipientEmail,
      organizationName: 'Organisation de test',
      remainingCount: 7,
      totalCount: 42,
      supportContactEmail: input.admin.email
    });

    await this.prisma.auditLog.create({
      data: {
        scope: 'APP_SETTINGS',
        scopeId: 'global',
        actorType: 'ADMIN',
        actorName: input.admin.name,
        actorEmail: input.admin.email,
        action: 'ORG_REMINDER_TEST_SENT',
        detailsJson: JSON.stringify({ to: recipientEmail })
      }
    });

    return {
      ok: true,
      message: `Courriel de test envoyé à ${recipientEmail}.`
    };
  }

  private async sendReminderEmail(payload: { to: string; organizationName: string; remainingCount: number; totalCount: number; supportContactEmail?: string }) {
    const settings = await this.prisma.appSettings.findUnique({ where: { id: 'global' } });
    const placeholders = {
      organizationName: payload.organizationName,
      remainingCount: String(payload.remainingCount),
      totalCount: String(payload.totalCount),
      supportContactEmail: payload.supportContactEmail || '',
      supportInstructions: payload.supportContactEmail
        ? `Assistance MS Teams: contactez ${payload.supportContactEmail}`
        : "Assistance MS Teams: utilisez le lien MS Teams de votre organisation."
    };

    const subject = this.applyTemplate(
      settings?.reminderEmailSubjectTemplate,
      placeholders,
      `Relance - Inventaire ${payload.organizationName} en cours de validation`
    );

    const textBody = this.applyTemplate(
      settings?.reminderEmailTextTemplate,
      placeholders,
      [
        'Bonjour,',
        '',
        `L'inventaire de l'organisation ${payload.organizationName} est toujours en cours de validation.`,
        `Il reste ${payload.remainingCount} éléments sur ${payload.totalCount} éléments à valider.`,
        '',
        placeholders.supportInstructions,
        '',
        'Merci.'
      ].join('\r\n')
    );

    const defaultHtmlBody = this.buildReminderHtmlEmail(payload);
    const htmlBody = this.applyTemplate(settings?.reminderEmailHtmlTemplate, placeholders, defaultHtmlBody);

    await this.sendSmtpMail({
      host: 'outbound.cisco.com',
      port: 25,
      from: 'santequebec@cisco.com',
      to: payload.to,
      subject,
      textBody,
      htmlBody
    });
  }

  private buildReminderHtmlEmail(payload: { organizationName: string; remainingCount: number; totalCount: number; supportContactEmail?: string }) {
    const safeOrg = this.escapeHtml(payload.organizationName);
    const remainingCount = payload.remainingCount;
    const totalCount = payload.totalCount;
    const ciscoLogoUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Cisco_logo_blue_2016.svg/1280px-Cisco_logo_blue_2016.svg.png';
    const teamsIconUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg/512px-Microsoft_Office_Teams_%282018%E2%80%93present%29.svg.png';

    const teamsLink = payload.supportContactEmail
      ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(payload.supportContactEmail)}`
      : null;

    const supportCard = teamsLink
      ? `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px; width:100%; border-collapse:separate; border-spacing:0; background:#f3f8ff; border:1px solid #cfe4ff; border-radius:12px;">
          <tr>
            <td style="padding:18px 20px 20px;">
              <p style="margin:0 0 12px; font-size:15px; line-height:1.6; color:#0f2a47;"><strong>Besoin d’assistance&nbsp;?</strong> Contactez votre personne-ressource via Microsoft Teams.</p>
              <a href="${teamsLink}" target="_blank" rel="noreferrer" style="display:inline-block; text-decoration:none; background:#4b53bc; color:#ffffff; font-weight:700; font-size:14px; line-height:20px; border-radius:8px; padding:10px 16px;">
                <img src="${teamsIconUrl}" width="18" height="18" alt="Microsoft Teams" style="vertical-align:middle; margin-right:8px; border:0;" />
                Microsoft Teams - Joindre votre personne ressource
              </a>
            </td>
          </tr>
        </table>
      `
      : `
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px; width:100%; border-collapse:separate; border-spacing:0; background:#f8f9fb; border:1px solid #e2e8f0; border-radius:12px;">
          <tr>
            <td style="padding:18px 20px; font-size:14px; line-height:1.6; color:#334155;">
              Pour obtenir de l’assistance, utilisez le lien Microsoft Teams de votre organisation.
            </td>
          </tr>
        </table>
      `;

    return `
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Relance inventaire</title>
  </head>
  <body style="margin:0; padding:0; background:#eef3f8; font-family:Arial, Helvetica, sans-serif; color:#0f2a47;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#eef3f8; padding:30px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="680" style="width:680px; max-width:680px; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #d7e3f2; box-shadow:0 10px 30px rgba(15, 42, 71, 0.12);">
            <tr>
              <td style="padding:26px 30px 14px; background:#ffffff;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td valign="middle">
                      <img src="${ciscoLogoUrl}" width="66" alt="Cisco" style="display:block; border:0;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 30px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td height="8" style="height:8px; background:#7b8ea4; font-size:0; line-height:0;">&nbsp;</td></tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px 10px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate; border-spacing:0; background:#f2f5f9; border:1px solid #d9e1ea; border-radius:8px;">
                  <tr>
                    <td style="padding:24px 22px;">
                      <h1 style="margin:0; font-size:19.5px; line-height:1.25; color:#102a43;">Relance de validation d’inventaire</h1>
                      <p style="margin:12px 0 0; font-size:15px; line-height:1.65; color:#334e68;">Organisation concernée&nbsp;: <strong>${safeOrg}</strong></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 30px 0;">
                <p style="margin:0; font-size:16px; line-height:1.7; color:#102a43;"><strong>Bonjour,</strong></p>
                <p style="margin:12px 0 0; font-size:15px; line-height:1.75; color:#102a43;">L’inventaire de l’organisation <strong>${safeOrg}</strong> est toujours en cours de validation. Merci de compléter les éléments restants dès que possible.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 30px 6px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate; border-spacing:0; background:#f3f8ff; border:1px solid #cfe4ff; border-radius:12px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <p style="margin:0; font-size:14px; color:#486581; text-transform:uppercase; letter-spacing:0.4px;">Progression actuelle</p>
                      <p style="margin:8px 0 0; font-size:31px; line-height:1.2; font-weight:700; color:#0f6ecd;">${remainingCount} / ${totalCount}</p>
                      <p style="margin:8px 0 0; font-size:14px; color:#334e68;">éléments restants à valider</p>
                    </td>
                  </tr>
                </table>
                ${supportCard}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 30px 28px;">
                <p style="margin:0; font-size:15px; line-height:1.7; color:#102a43;">Merci de votre collaboration.</p>
                <p style="margin:8px 0 0; font-size:14px; color:#486581;">Équipe de compte Cisco en collaboration avec Santé Québec</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 30px; background:#f8fafc; border-top:1px solid #dbe5f0;">
                <p style="margin:0; font-size:12px; line-height:1.6; color:#627d98;">Ce message a été envoyé automatiquement depuis <strong>santequebec@cisco.com</strong>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim();
  }

  private applyTemplate(template: string | null | undefined, values: Record<string, string>, fallback: string) {
    const source = template?.trim();
    if (!source) return fallback;

    return source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => values[key] ?? '');
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async sendSmtpMail(input: { host: string; port: number; from: string; to: string; subject: string; textBody: string; htmlBody: string }) {
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
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="sq-reminder-boundary"',
        '',
        '--sq-reminder-boundary',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        input.textBody,
        '',
        '--sq-reminder-boundary',
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        input.htmlBody,
        '',
        '--sq-reminder-boundary--',
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

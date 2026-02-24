import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class WebexService {
  private readonly logger = new Logger(WebexService.name);

  constructor(private prisma: PrismaService) {}

  private async loadSettings() {
    return this.prisma.appSettings.findUnique({ where: { id: 'global' } });
  }

  private async postMessage(markdown: string) {
    const settings = await this.loadSettings();
    if (!settings?.webexEnabled || !settings.webexBotToken || !settings.webexRoomId) {
      return;
    }

    try {
      const response = await fetch('https://webexapis.com/v1/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.webexBotToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId: settings.webexRoomId,
          markdown
        })
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Webex API error ${response.status}: ${body}`);
      }
    } catch (error) {
      this.logger.error(`Webex publish failed: ${(error as Error).message}`);
    }
  }

  async notifyInventorySubmitted(payload: { orgName: string; orgCode: string; fileId: string; submittedAt: string }) {
    const settings = await this.loadSettings();
    if (!settings?.webexEnabled || !settings.webexNotifyOnSubmit) return;

    await this.postMessage([
      '📦 **Inventaire soumis**',
      `- Organisation: **${payload.orgName}** (${payload.orgCode})`,
      `- Inventaire: \`${payload.fileId}\``,
      `- Date: ${payload.submittedAt}`
    ].join('\n'));
  }

  async notifyHelpRequested(payload: { orgName: string; orgCode: string; requesterName: string; requesterEmail: string; ipAddress?: string | null; userAgent?: string | null; requestedAt: string }) {
    const settings = await this.loadSettings();
    if (!settings?.webexEnabled || !settings.webexNotifyOnHelp) return;

    await this.postMessage([
      '🆘 **Besoin d’aide signalé**',
      `- Organisation: **${payload.orgName}** (${payload.orgCode})`,
      `- Usager: **${payload.requesterName}** (${payload.requesterEmail})`,
      `- Adresse IP: ${payload.ipAddress || 'N/A'}`,
      `- User-Agent: ${payload.userAgent || 'N/A'}`,
      `- Date: ${payload.requestedAt}`
    ].join('\n'));
  }

  async notifyOrgLogin(payload: { orgName: string; orgCode: string; requesterName: string; requesterEmail: string; ipAddress?: string | null; userAgent?: string | null; loggedAt: string }) {
    const settings = await this.loadSettings();
    if (!settings?.webexEnabled || !settings.webexNotifyOnLogin) return;

    await this.postMessage([
      '🔐 **Connexion organisation**',
      `- Organisation: **${payload.orgName}** (${payload.orgCode})`,
      `- Usager: **${payload.requesterName}** (${payload.requesterEmail})`,
      `- Adresse IP: ${payload.ipAddress || 'N/A'}`,
      `- User-Agent: ${payload.userAgent || 'N/A'}`,
      `- Date: ${payload.loggedAt}`
    ].join('\n'));
  }

  async validateConnection() {
    const settings = await this.loadSettings();
    if (!settings?.webexBotToken || !settings.webexRoomId) {
      return { ok: false, message: 'Configuration Webex incomplète.' };
    }

    try {
      const response = await fetch(`https://webexapis.com/v1/rooms/${settings.webexRoomId}`, {
        headers: {
          Authorization: `Bearer ${settings.webexBotToken}`
        }
      });

      if (!response.ok) {
        const body = await response.text();
        return { ok: false, message: `Échec Webex (${response.status}): ${body}` };
      }

      return { ok: true, message: 'Connexion Webex valide.' };
    } catch (error) {
      return { ok: false, message: `Erreur Webex: ${(error as Error).message}` };
    }
  }
}

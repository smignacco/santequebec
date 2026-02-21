import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private readonly defaultAdminUser = 'admin';
  // Mot de passe par défaut: Admin123!
  private readonly defaultAdminPassHash = '$argon2id$v=19$m=65536,t=3,p=4$TAg3TXhsv+LfI6QTFg5j8Q$HEsS+vP6uCfYUbL2a9AIvY4m1DVJ3bzQ5AxlYR4QzOc';

  async orgLogin(input: { orgCode: string; pin: string; name: string; email: string }) {
    const org = await this.prisma.organization.findUnique({ where: { orgCode: input.orgCode } });
    if (!org) throw new UnauthorizedException('Invalid credentials');
    const access = await this.prisma.orgAccess.findFirst({
      where: { organizationId: org.id, isEnabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { batch: true }
    });
    if (!access) throw new UnauthorizedException('No active access');
    const ok = await argon2.verify(access.pinHash, input.pin);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = await this.jwt.signAsync({ role: 'ORG_USER', organizationId: org.id, batchId: access.batchId, name: input.name, email: input.email });
    await this.prisma.auditLog.create({ data: { scope: 'ORG_ACCESS', scopeId: access.id, actorType: 'ORG_USER', actorName: input.name, actorEmail: input.email, action: 'ORG_LOGIN', detailsJson: JSON.stringify({ orgCode: input.orgCode }) } });
    return { token };
  }

  async adminLogin(input: { username: string; password: string }) {
    const user = process.env.ADMIN_USER ?? this.defaultAdminUser;
    const hash = process.env.ADMIN_PASS_HASH ?? this.defaultAdminPassHash;
    if (input.username !== user || !(await argon2.verify(hash, input.password))) throw new UnauthorizedException('Invalid credentials');
    const token = await this.jwt.signAsync({ role: 'ADMIN', name: 'Admin', email: 'admin@santequebec.local' });
    return { token };
  }
}

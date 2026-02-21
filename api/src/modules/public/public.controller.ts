import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Controller('api/public')
export class PublicController {
  constructor(private prisma: PrismaService) {}

  @Get('orgs')
  async find(@Query('q') q = '') {
    return this.prisma.organization.findMany({
      where: { displayName: { contains: q }, isActive: true },
      select: { displayName: true, orgCode: true },
      take: 20
    });
  }
}

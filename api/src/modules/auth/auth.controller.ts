import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { ThrottleGuard } from './throttle.guard';

class OrgLoginDto {
  @IsString() orgCode!: string;
  @IsString() @MinLength(4) pin!: string;
  @IsString() name!: string;
  @IsEmail() email!: string;
}

class AdminLoginDto {
  @IsString() username!: string;
  @IsString() password!: string;
}

@Controller('api/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @UseGuards(ThrottleGuard)
  @Post('org-login')
  orgLogin(@Body() dto: OrgLoginDto, @Req() req: any) {
    return this.auth.orgLogin(dto, {
      ipAddress: String(req.headers?.['x-forwarded-for'] || req.ip || '').split(',')[0]?.trim() || null,
      userAgent: req.headers?.['user-agent'] || null
    });
  }

  @Post('admin-login')
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.auth.adminLogin(dto);
  }
}

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers.authorization as string | undefined;
    const queryToken = typeof req.query?.access_token === 'string' ? req.query.access_token : undefined;
    const token = auth?.startsWith('Bearer ')
      ? auth.slice(7)
      : queryToken;

    if (!token) throw new UnauthorizedException();

    try {
      req.user = this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-secret' });
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

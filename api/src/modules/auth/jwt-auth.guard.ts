import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers.authorization as string | undefined;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      req.user = this.jwt.verify(auth.slice(7), { secret: process.env.JWT_SECRET || 'dev-secret' });
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

import { CanActivate, ExecutionContext, Injectable, TooManyRequestsException } from '@nestjs/common';

const hits = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class ThrottleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || now > rec.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (rec.count >= 20) throw new TooManyRequestsException();
    rec.count += 1;
    return true;
  }
}

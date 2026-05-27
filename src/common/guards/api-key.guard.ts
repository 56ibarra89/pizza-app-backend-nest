import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function shouldEnforceApiKey(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.REQUIRE_API_KEY === 'true';
}

function extractApiKey(req: { headers?: Record<string, unknown> }): string | undefined {
  const headers = (req.headers ?? {}) as Record<string, unknown>;

  const xApiKey = headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) return xApiKey.trim();

  const auth = headers['authorization'];
  if (typeof auth === 'string') {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]?.trim()) return m[1].trim();
  }

  return undefined;
}

function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (!shouldEnforceApiKey()) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const expected = process.env.API_KEY;
    if (!expected) {
      throw new UnauthorizedException('API key required');
    }

    const req = context.switchToHttp().getRequest();
    const received = extractApiKey(req);
    if (!received) throw new UnauthorizedException('API key required');

    if (!safeEquals(received, expected)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}

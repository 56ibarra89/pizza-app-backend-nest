import type { ConfigService } from '@nestjs/config';

const MIN_SECRET_BYTES = 32;

export function requireSecuritySecret(
  config: ConfigService,
  name: 'JWT_SECRET' | 'PIN_PEPPER',
): string {
  const value = config.get<string>(name)?.trim();
  if (!value || Buffer.byteLength(value, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      `${name} must be configured with at least ${MIN_SECRET_BYTES} bytes.`,
    );
  }
  return value;
}

export function getJwtIssuer(config: ConfigService): string {
  return config.get<string>('JWT_ISSUER')?.trim() || 'pizza-app-backend';
}

export function getJwtAudience(config: ConfigService): string {
  return config.get<string>('JWT_AUDIENCE')?.trim() || 'app-factura';
}

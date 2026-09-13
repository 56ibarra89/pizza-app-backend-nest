import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  const apiHost = process.env.API_HOST?.trim() || '127.0.0.1';
  const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(apiHost);
  const trustProxyHops = Number.parseInt(
    process.env.TRUST_PROXY_HOPS || '0',
    10,
  );

  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    const expressApp = app.getHttpAdapter().getInstance();
    if (typeof expressApp?.set === 'function') {
      expressApp.set('trust proxy', trustProxyHops);
    }
  }

  const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true';
  app.use(
    helmet({
      contentSecurityPolicy: swaggerEnabled ? false : undefined,
    }),
  );

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];
  const allowedOrigins = new Set(
    corsOrigins.length
      ? corsOrigins
      : isLoopback
        ? ['http://localhost:5173', 'http://127.0.0.1:5173', 'file://', 'null']
        : [],
  );
  if (!isLoopback && allowedOrigins.size === 0) {
    throw new Error(
      'CORS_ORIGINS must be configured when the API is exposed outside localhost.',
    );
  }
  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Pizza App API')
      .setDescription('API REST del sistema de facturación y POS')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = Number.parseInt(process.env.PORT || '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  await app.listen(port, apiHost);
  logger.log(`API listening on ${apiHost}:${port}`);
  if (!process.env.NODE_ENV) {
    logger.warn('NODE_ENV is not configured; using development behavior.');
  }
}
bootstrap();

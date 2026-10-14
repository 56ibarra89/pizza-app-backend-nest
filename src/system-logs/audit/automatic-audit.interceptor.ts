import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { catchError, concatMap, from, Observable, tap, throwError } from 'rxjs';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { toAuditJson } from './audit-value.util';
import { AuditSnapshotService } from './audit-snapshot.service';
import { AuditWriteQueueService } from './audit-write-queue.service';

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const NON_ENTITY_SEGMENTS = new Set(['api', 'v1', 'v2']);

function cleanSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
}

function getRouteSegments(request: Request): string[] {
  return request.originalUrl
    .split('?')[0]
    .split('/')
    .map(cleanSegment)
    .filter(Boolean)
    .filter((segment) => !NON_ENTITY_SEGMENTS.has(segment));
}

function isIdentifier(segment: string): boolean {
  return /^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment);
}

function resolveOperation(
  method: string,
  segments: string[],
  params: Record<string, unknown>,
): string {
  if (method === 'DELETE') return 'DELETE';
  if (method === 'PUT' || method === 'PATCH') return 'UPDATE';

  const paramValues = new Set(
    Object.values(params).map((value) => cleanSegment(String(value))),
  );
  const lastStaticSegment = [...segments]
    .reverse()
    .find((segment) => !isIdentifier(segment) && !paramValues.has(segment));
  if (lastStaticSegment && lastStaticSegment !== segments[0]) {
    return lastStaticSegment.replace(/-/g, '_').toUpperCase();
  }
  return 'CREATE';
}

function resolveEntityId(
  request: AuthenticatedRequest,
  responseBody?: unknown,
): string | undefined {
  const params = request.params as Record<string, unknown>;
  const preferredParam = ['id', 'orderId', 'userId', 'productId', 'shiftId']
    .map((key) => params?.[key])
    .find((value) => typeof value === 'string' || typeof value === 'number');
  if (preferredParam !== undefined) return String(preferredParam);

  if (
    responseBody &&
    typeof responseBody === 'object' &&
    !Array.isArray(responseBody)
  ) {
    const id = (responseBody as Record<string, unknown>).id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }

  const bodyId = (request.body as Record<string, unknown> | undefined)?.id;
  return typeof bodyId === 'string' || typeof bodyId === 'number'
    ? String(bodyId)
    : undefined;
}

function resolveIp(request: Request): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0];
  return request.ip || request.socket.remoteAddress;
}

@Injectable()
export class AutomaticAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AutomaticAuditInterceptor.name);

  constructor(
    private readonly auditQueue: AuditWriteQueueService,
    private readonly snapshots: AuditSnapshotService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();
    const segments = getRouteSegments(request);
    const module = segments[0];

    if (
      !MUTATING_METHODS.has(method) ||
      !request.user ||
      !module ||
      module === 'system-logs'
    ) {
      return next.handle();
    }

    const startedAt = Date.now();
    const requestBody = request.body as unknown;
    const requestIdHeader = request.headers['x-request-id'];
    const requestId =
      (Array.isArray(requestIdHeader)
        ? requestIdHeader[0]
        : requestIdHeader
      )?.slice(0, 120) || randomUUID();
    const operation = resolveOperation(method, segments, request.params);
    const action = `${module.replace(/-/g, '_').toUpperCase()}_${operation}`;
    const route = request.originalUrl.split('?')[0];
    const sourceHeader = request.headers['x-audit-source'];
    const source =
      (Array.isArray(sourceHeader) ? sourceHeader[0] : sourceHeader)
        ?.slice(0, 40)
        .toUpperCase() || 'API';

    response.setHeader('X-Request-Id', requestId);

    return from(
      this.snapshots.capture(
        module,
        segments,
        request.params,
        operation !== 'CREATE',
      ),
    ).pipe(
      concatMap((snapshot) =>
        next.handle().pipe(
          tap((responseBody) => {
            const enqueued = this.auditQueue.enqueue({
              user: request.user!,
              action,
              module,
              operation,
              entity: snapshot.entity,
              entityId:
                snapshot.entityId ?? resolveEntityId(request, responseBody),
              source,
              requestId,
              ipAddress: resolveIp(request),
              userAgent: request.get('user-agent'),
              httpMethod: method,
              route,
              statusCode: response.statusCode,
              success: true,
              durationMs: Date.now() - startedAt,
              before: toAuditJson(snapshot.before),
              after: toAuditJson(responseBody),
              metadata: toAuditJson({ requestedChanges: requestBody }),
            });
            if (!enqueued) {
              this.logger.error(`No se pudo encolar la auditoría ${requestId}`);
            }
          }),
          catchError((error: unknown) => {
            const statusCode =
              error instanceof HttpException ? error.getStatus() : 500;
            const enqueued = this.auditQueue.enqueue({
              user: request.user!,
              action,
              module,
              operation,
              entity: snapshot.entity,
              entityId: snapshot.entityId ?? resolveEntityId(request),
              source,
              requestId,
              ipAddress: resolveIp(request),
              userAgent: request.get('user-agent'),
              httpMethod: method,
              route,
              statusCode,
              success: false,
              durationMs: Date.now() - startedAt,
              before: toAuditJson(snapshot.before),
              metadata: toAuditJson({
                requestedChanges: requestBody,
                error:
                  error instanceof Error
                    ? { name: error.name, message: error.message }
                    : String(error),
              }),
            });
            if (!enqueued) {
              this.logger.error(
                `No se pudo encolar la auditoría fallida ${requestId}`,
              );
            }
            return throwError(() => error);
          }),
        ),
      ),
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditSnapshot {
  entity: string;
  entityId?: string;
  before?: unknown;
}

function numericId(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

@Injectable()
export class AuditSnapshotService {
  private readonly logger = new Logger(AuditSnapshotService.name);

  constructor(private readonly prisma: PrismaService) {}

  async capture(
    module: string,
    segments: string[],
    params: Record<string, unknown>,
    shouldReadBefore: boolean,
  ): Promise<AuditSnapshot> {
    const id = typeof params.id === 'string' ? params.id : undefined;
    const extraId =
      typeof params.extraId === 'string' ? params.extraId : undefined;
    const entityId = extraId ?? id;
    let entity = module;

    if (!shouldReadBefore || !entityId) return { entity, entityId };

    try {
      switch (module) {
        case 'products':
          if (segments.includes('extras') && extraId) {
            entity = 'category-extra';
            return {
              entity,
              entityId: extraId,
              before: await this.prisma.categoryExtra.findUnique({
                where: { id: extraId },
              }),
            };
          }
          if (segments.includes('categories')) {
            entity = 'category';
            return {
              entity,
              entityId: id,
              before: await this.prisma.category.findUnique({ where: { id } }),
            };
          }
          entity = 'product';
          return {
            entity,
            entityId: id,
            before: await this.prisma.product.findUnique({ where: { id } }),
          };
        case 'customers':
          entity = 'customer';
          return {
            entity,
            entityId: id,
            before: await this.prisma.customer.findUnique({ where: { id } }),
          };
        case 'users':
          entity = 'user';
          return {
            entity,
            entityId: id,
            before: await this.prisma.user.findUnique({
              where: { id },
              select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                accessRoleId: true,
                isActive: true,
                lockedUntil: true,
                workDays: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
          };
        case 'orders':
          entity = 'order';
          return {
            entity,
            entityId: id,
            before: await this.prisma.order.findUnique({ where: { id } }),
          };
        case 'config':
          entity = 'app-config';
          return {
            entity,
            entityId: id,
            before: await this.prisma.appConfig.findUnique({ where: { id } }),
          };
        case 'shifts':
          entity = 'shift';
          return {
            entity,
            entityId: id,
            before: await this.prisma.shift.findUnique({ where: { id } }),
          };
        case 'mesas':
          entity = 'mesa';
          return {
            entity,
            entityId: id,
            before: await this.prisma.mesa.findUnique({ where: { id } }),
          };
        case 'kitchens':
          entity = 'kitchen';
          return {
            entity,
            entityId: id,
            before: await this.prisma.kitchen.findUnique({ where: { id } }),
          };
        case 'correlativos':
          entity = 'correlativo';
          return {
            entity,
            entityId: id,
            before: await this.prisma.correlativo.findUnique({ where: { id } }),
          };
        case 'notifications':
          entity = 'notification';
          return {
            entity,
            entityId: id,
            before: await this.prisma.notification.findUnique({
              where: { id },
            }),
          };
        case 'cash-expenses':
          entity = 'cash-expense';
          return {
            entity,
            entityId: id,
            before: await this.prisma.cashExpense.findUnique({ where: { id } }),
          };
        case 'access-control':
          entity = 'access-role';
          return {
            entity,
            entityId: id,
            before: await this.prisma.accessRole.findUnique({ where: { id } }),
          };
        case 'promotions': {
          const promotionId = numericId(id);
          if (promotionId === undefined) return { entity, entityId };
          if (segments.includes('happy-hours')) {
            entity = 'happy-hour';
            return {
              entity,
              entityId: id,
              before: await this.prisma.happyHourPromotion.findUnique({
                where: { id: promotionId },
              }),
            };
          }
          if (segments.includes('discounts')) {
            entity = 'discount';
            return {
              entity,
              entityId: id,
              before: await this.prisma.discountPromotion.findUnique({
                where: { id: promotionId },
              }),
            };
          }
          if (segments.includes('coupons')) {
            entity = 'coupon';
            return {
              entity,
              entityId: id,
              before: await this.prisma.cupon.findUnique({
                where: { id: promotionId },
              }),
            };
          }
          if (segments.includes('certificates')) {
            entity = 'certificate';
            return {
              entity,
              entityId: id,
              before: await this.prisma.certificado.findUnique({
                where: { id: promotionId },
              }),
            };
          }
        }
      }
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo obtener el estado anterior de ${module}/${entityId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { entity, entityId };
  }
}

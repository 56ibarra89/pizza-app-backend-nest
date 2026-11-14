import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const HIDDEN_ORDER_PREFIX = 'order:';

@Injectable()
export class HiddenKitchenTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTicketIds(): Promise<string[]> {
    const hiddenTickets = await this.prisma.hiddenKitchenTicket.findMany({
      where: {
        NOT: {
          ticketId: { startsWith: HIDDEN_ORDER_PREFIX },
        },
      },
      select: { ticketId: true },
    });

    return hiddenTickets.map(({ ticketId }) => ticketId);
  }

  async hide(
    ticketIds: readonly string[] | undefined,
    hiddenBy: string,
  ): Promise<void> {
    const uniqueTicketIds = [
      ...new Set(
        (ticketIds ?? []).filter(
          (id) => Boolean(id) && !id.startsWith(HIDDEN_ORDER_PREFIX),
        ),
      ),
    ];
    if (uniqueTicketIds.length === 0) return;

    const parsedTickets = uniqueTicketIds.map((ticketId) => ({
      ticketId,
      ...this.parseTicketId(ticketId),
    }));
    const candidateOrderIds = [
      ...new Set(
        parsedTickets.flatMap((ticket) =>
          ticket.orderId ? [ticket.orderId] : [],
        ),
      ),
    ];
    const existingOrders =
      candidateOrderIds.length > 0
        ? await this.prisma.order.findMany({
            where: { id: { in: candidateOrderIds } },
            select: { id: true },
          })
        : [];
    const existingOrderIds = new Set(existingOrders.map((order) => order.id));

    await this.prisma.hiddenKitchenTicket.createMany({
      data: parsedTickets.map(({ ticketId, orderId, sentAt }) => ({
        ticketId,
        hiddenBy,
        orderId: orderId && existingOrderIds.has(orderId) ? orderId : null,
        sentAt: orderId && existingOrderIds.has(orderId) ? sentAt : null,
      })),
      skipDuplicates: true,
    });
  }

  async listHiddenOrderIds(): Promise<string[]> {
    const hiddenOrders = await this.prisma.hiddenKitchenTicket.findMany({
      where: {
        ticketId: { startsWith: HIDDEN_ORDER_PREFIX },
      },
      select: { ticketId: true },
    });

    return hiddenOrders.map(({ ticketId }) =>
      ticketId.slice(HIDDEN_ORDER_PREFIX.length),
    );
  }

  async hideOrderIds(
    orderIds: readonly string[] | undefined,
    hiddenBy: string,
  ): Promise<void> {
    const uniqueOrderIds = [...new Set((orderIds ?? []).filter(Boolean))];
    if (uniqueOrderIds.length === 0) return;

    const existingOrders = await this.prisma.order.findMany({
      where: { id: { in: uniqueOrderIds } },
      select: { id: true },
    });
    const existingOrderIds = new Set(existingOrders.map((order) => order.id));
    if (existingOrderIds.size === 0) return;

    await this.prisma.hiddenKitchenTicket.createMany({
      data: [...existingOrderIds].map((orderId) => ({
        ticketId: `${HIDDEN_ORDER_PREFIX}${orderId}`,
        hiddenBy,
        orderId,
        sentAt: null,
      })),
      skipDuplicates: true,
    });
  }

  private parseTicketId(ticketId: string): {
    orderId?: string;
    sentAt?: Date;
  } {
    const match = /^(.*)-(\d{10,})$/.exec(ticketId);
    if (!match) return {};

    const sentAt = new Date(Number(match[2]));
    if (!match[1] || Number.isNaN(sentAt.getTime())) return {};
    return { orderId: match[1], sentAt };
  }
}

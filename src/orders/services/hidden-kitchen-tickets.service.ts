import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HiddenKitchenTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTicketIds(): Promise<string[]> {
    const hiddenTickets = await this.prisma.hiddenKitchenTicket.findMany({
      select: { ticketId: true },
    });

    return hiddenTickets.map(({ ticketId }) => ticketId);
  }

  async hide(
    ticketIds: readonly string[] | undefined,
    hiddenBy: string,
  ): Promise<void> {
    const uniqueTicketIds = [...new Set((ticketIds ?? []).filter(Boolean))];
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

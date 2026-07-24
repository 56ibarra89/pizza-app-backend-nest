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

    await this.prisma.hiddenKitchenTicket.createMany({
      data: uniqueTicketIds.map((ticketId) => ({ ticketId, hiddenBy })),
      skipDuplicates: true,
    });
  }
}

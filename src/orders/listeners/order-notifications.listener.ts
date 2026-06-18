import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../../prisma/prisma.service';

export class OrderCancelledEvent {
  orderId!: string;
  invoiceNum!: string;
  cashierName!: string;
  adminName!: string;
  reasonStr!: string;
}

@Injectable()
export class OrderNotificationsListener {
  private readonly logger = new Logger(OrderNotificationsListener.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('order.cancelled', { async: true })
  async handleOrderCancelledEvent(event: OrderCancelledEvent) {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true, email: { not: null } }
      });

      if (admins.length > 0) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #D32F2F; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">Alerta de Anulación</h1>
            </div>
            <div style="padding: 30px; background-color: #ffffff; color: #333333;">
              <h2 style="margin-top: 0; color: #1a1a1a;">Se ha anulado una factura</h2>
              <p style="font-size: 16px; line-height: 1.5;">Detalles de la anulación:</p>
              <ul>
                <li><strong>ID Orden / Factura:</strong> ${event.orderId} / ${event.invoiceNum}</li>
                <li><strong>Cajero Responsable:</strong> ${event.cashierName}</li>
                <li><strong>Autorizado por (PIN):</strong> ${event.adminName}</li>
                <li><strong>Motivo de anulación:</strong> ${event.reasonStr}</li>
              </ul>
              <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;" />
              <p style="font-size: 12px; color: #999999; text-align: center;">Este es un mensaje automático del sistema Pizza To Go.</p>
            </div>
          </div>
        `;

        for (const admin of admins) {
          if (admin.email) {
            this.mailerService.sendMail({
              to: admin.email,
              subject: `Alerta: Factura Anulada ${event.invoiceNum}`,
              html: emailHtml,
            }).catch(e => this.logger.error("Failed to send cancellation email to " + admin.email, e));
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error enviando correo de cancelación de orden ${event.orderId}`, error);
    }
  }
}

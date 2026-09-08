import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../app-config/services/app-config.service';
import { PrinterConfigDto } from './dto/printer-config.dto';

const HARDWARE_PRINTERS_CONFIG_ID = 'hardware_printers';

const DEFAULT_PRINTERS: PrinterConfigDto[] = [
  {
    id: 'printer-cashier-default',
    name: 'Impresora Facturación (Caja)',
    role: 'cashier',
    connectionType: 'usb',
    windowsDeviceName: '',
    openCashDrawer: true,
    isActive: true,
  },
  {
    id: 'printer-kitchen-default',
    name: 'Impresora Cocina (Comandas)',
    role: 'kitchen',
    connectionType: 'network',
    ipAddress: '192.168.1.200',
    port: 9100,
    fallbackPrinterId: 'printer-cashier-default',
    openCashDrawer: false,
    isActive: true,
  },
];

@Injectable()
export class DevicesService {
  constructor(private readonly appConfigService: AppConfigService) {}

  async getPrinters(): Promise<PrinterConfigDto[]> {
    const config = await this.appConfigService.getByIdOrDefault(
      HARDWARE_PRINTERS_CONFIG_ID,
    );
    const data = config.data as { printers?: PrinterConfigDto[] } | null;

    if (
      data &&
      Array.isArray(data.printers) &&
      data.printers.length > 0
    ) {
      return data.printers;
    }

    // Si aún no hay configuración guardada, inicializamos con los valores predeterminados
    await this.saveAllPrinters(DEFAULT_PRINTERS);
    return DEFAULT_PRINTERS;
  }

  async savePrinter(dto: PrinterConfigDto): Promise<PrinterConfigDto> {
    const current = await this.getPrinters();
    const index = current.findIndex((p) => p.id === dto.id);

    let updated: PrinterConfigDto[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = { ...updated[index], ...dto };
    } else {
      updated = [...current, dto];
    }

    await this.saveAllPrinters(updated);
    return dto;
  }

  async deletePrinter(id: string): Promise<void> {
    const current = await this.getPrinters();
    const updated = current.filter((p) => p.id !== id);
    await this.saveAllPrinters(updated);
  }

  async saveAllPrinters(printers: PrinterConfigDto[]): Promise<void> {
    await this.appConfigService.upsert(HARDWARE_PRINTERS_CONFIG_ID, {
      data: { printers },
    });
  }

  /**
   * Provee una lista de dispositivos para compatibilidad con la vista de periféricos.
   */
  async getLegacyDevices(): Promise<any[]> {
    const printers = await this.getPrinters();

    const devices = printers.map((p) => ({
      id: p.id,
      name: p.name,
      type: 'printer',
      status: p.isActive ? 'connected' : 'disconnected',
      details:
        p.connectionType === 'network'
          ? `Red LAN ${p.ipAddress || '192.168.1.XXX'}:${p.port || 9100} - Rol: ${p.role}`
          : `Cable USB Windows (${p.windowsDeviceName || 'Predeterminada'}) - Rol: ${p.role}`,
      isDefault: p.role === 'cashier' || p.role === 'both',
    }));

    return devices;
  }
}

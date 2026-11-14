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
    const data = config.data as {
      printers?: PrinterConfigDto[];
      initialized?: boolean;
    } | null;

    if (
      data &&
      Array.isArray(data.printers) &&
      (data.initialized === true || data.printers.length > 0)
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
    const normalized: PrinterConfigDto = {
      id: dto.id.trim(),
      name: dto.name.trim(),
      role: dto.role,
      connectionType: dto.connectionType,
      windowsDeviceName:
        dto.connectionType === 'usb' ? dto.windowsDeviceName : undefined,
      ipAddress: dto.connectionType === 'network' ? dto.ipAddress : undefined,
      port: dto.connectionType === 'network' ? dto.port : undefined,
      openCashDrawer: dto.openCashDrawer ?? false,
      fallbackPrinterId: dto.fallbackPrinterId,
      isActive: dto.isActive,
    };

    let updated: PrinterConfigDto[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = normalized;
    } else {
      updated = [...current, normalized];
    }

    await this.saveAllPrinters(updated);
    return normalized;
  }

  async deletePrinter(id: string): Promise<void> {
    const current = await this.getPrinters();
    const updated = current.filter((p) => p.id !== id);
    await this.saveAllPrinters(updated);
  }

  async saveAllPrinters(printers: PrinterConfigDto[]): Promise<void> {
    await this.appConfigService.upsert(HARDWARE_PRINTERS_CONFIG_ID, {
      data: { printers, initialized: true },
    });
  }

  /**
   * Provee una lista de dispositivos para compatibilidad con la vista de periféricos.
   */
  async getLegacyDevices(): Promise<any[]> {
    const printers = await this.getPrinters();

    const devices = printers.flatMap((p) => {
      const printerEntry = {
        id: p.id,
        name: p.name,
        type: 'printer',
        status: p.isActive ? 'connected' : 'disconnected',
        details:
          p.connectionType === 'network'
            ? `Red LAN ${p.ipAddress || '192.168.1.XXX'}:${p.port || 9100} - Rol: ${p.role}`
            : `Cable USB Windows (${p.windowsDeviceName || 'Predeterminada'}) - Rol: ${p.role}`,
        isDefault: p.role === 'cashier' || p.role === 'both',
      };

      if (!p.openCashDrawer) {
        return [printerEntry];
      }

      return [
        printerEntry,
        {
          id: `${p.id}-drawer`,
          name: `Gaveta de Efectivo (${p.name})`,
          type: 'drawer',
          status: p.isActive ? 'connected' : 'disconnected',
          details: `Apertura automática vía ${p.name}`,
          isDefault: p.role === 'cashier' || p.role === 'both',
        },
      ];
    });

    return devices;
  }
}

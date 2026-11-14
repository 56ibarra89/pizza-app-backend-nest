import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  const appConfigService = {
    getByIdOrDefault: jest.fn(),
    upsert: jest.fn(),
  };

  let service: DevicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DevicesService(appConfigService as any);
  });

  it('no vuelve a sembrar impresoras por defecto cuando la lista fue vaciada explícitamente', async () => {
    appConfigService.getByIdOrDefault.mockResolvedValue({
      id: 'hardware_printers',
      data: { printers: [], initialized: true },
    });

    const printers = await service.getPrinters();

    expect(printers).toEqual([]);
    expect(appConfigService.upsert).not.toHaveBeenCalled();
  });

  it('normaliza y limpia campos incompatibles al cambiar conexión de usb a network', async () => {
    appConfigService.getByIdOrDefault.mockResolvedValue({
      id: 'hardware_printers',
      data: {
        initialized: true,
        printers: [
          {
            id: 'p-1',
            name: 'Caja',
            role: 'cashier',
            connectionType: 'usb',
            windowsDeviceName: 'EPSON-TM-T20',
            openCashDrawer: true,
            isActive: true,
          },
        ],
      },
    });
    appConfigService.upsert.mockResolvedValue(undefined);

    const saved = await service.savePrinter({
      id: 'p-1',
      name: 'Caja LAN',
      role: 'cashier',
      connectionType: 'network',
      ipAddress: '192.168.1.50',
      port: 9100,
      openCashDrawer: true,
      isActive: true,
    });

    expect(saved.windowsDeviceName).toBeUndefined();
    expect(appConfigService.upsert).toHaveBeenCalledWith('hardware_printers', {
      data: {
        initialized: true,
        printers: [
          {
            id: 'p-1',
            name: 'Caja LAN',
            role: 'cashier',
            connectionType: 'network',
            windowsDeviceName: undefined,
            ipAddress: '192.168.1.50',
            port: 9100,
            openCashDrawer: true,
            fallbackPrinterId: undefined,
            isActive: true,
          },
        ],
      },
    });
  });

  it('expone gavetas derivadas en getLegacyDevices cuando openCashDrawer está habilitado', async () => {
    appConfigService.getByIdOrDefault.mockResolvedValue({
      id: 'hardware_printers',
      data: {
        initialized: true,
        printers: [
          {
            id: 'p-1',
            name: 'Caja',
            role: 'cashier',
            connectionType: 'usb',
            windowsDeviceName: 'EPSON',
            openCashDrawer: true,
            isActive: true,
          },
        ],
      },
    });

    const devices = await service.getLegacyDevices();

    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.type)).toEqual(['printer', 'drawer']);
  });
});

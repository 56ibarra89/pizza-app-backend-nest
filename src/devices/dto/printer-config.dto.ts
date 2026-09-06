import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class PrinterConfigDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string; // ej. "Impresora Caja" o "Impresora Cocina"

  @IsIn(['cashier', 'kitchen', 'both'])
  role!: 'cashier' | 'kitchen' | 'both';

  @IsIn(['usb', 'network'])
  connectionType!: 'usb' | 'network';

  @IsOptional()
  @IsString()
  windowsDeviceName?: string; // Para tipo USB

  @IsOptional()
  @IsString()
  ipAddress?: string; // Para tipo Network

  @IsOptional()
  @IsNumber()
  port?: number; // 9100 por defecto

  @IsOptional()
  @IsBoolean()
  openCashDrawer?: boolean;

  @IsOptional()
  @IsString()
  fallbackPrinterId?: string; // ID de la impresora de respaldo

  @IsBoolean()
  isActive!: boolean;
}

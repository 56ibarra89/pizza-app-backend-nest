import { ApiProperty } from '@nestjs/swagger';

export type BackupType = 'AUTOMATIC' | 'MANUAL' | 'SHIFT_CLOSE' | 'SAFETY_SNAPSHOT';
export type BackupLocation = 'LOCAL' | 'CLOUD' | 'SYNCED';

export class BackupItemDto {
  @ApiProperty()
  filename: string;

  @ApiProperty()
  sizeBytes: number;

  @ApiProperty()
  sizeMb: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ enum: ['AUTOMATIC', 'MANUAL', 'SHIFT_CLOSE', 'SAFETY_SNAPSHOT'] })
  type: BackupType;

  @ApiProperty({ enum: ['LOCAL', 'CLOUD', 'SYNCED'] })
  location: BackupLocation;
}

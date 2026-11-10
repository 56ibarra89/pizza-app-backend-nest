import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaCertificatePromotionsRepository } from './prisma-certificate-promotions.repository';

describe('PrismaCertificatePromotionsRepository', () => {
  it('libera el serial comercial al aplicar soft-delete', async () => {
    const findUnique = jest.fn().mockResolvedValue({ serial: 'VC-100' });
    const update = jest.fn().mockResolvedValue({});
    const repository = new PrismaCertificatePromotionsRepository({
      certificado: { findUnique, update },
    } as unknown as PrismaService);

    await repository.delete(7);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ serial: 'VC-100#deleted-7' }),
      }),
    );
  });
});

import { KitchensService } from './kitchens.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('KitchensService', () => {
  const findUnique = jest.fn();
  const prisma = {
    cookKitchenAssignment: { findUnique },
  } as unknown as PrismaService;
  const service = new KitchensService(prisma);

  beforeEach(() => {
    findUnique.mockReset();
  });

  it('resuelve la cocina asignada para el día local indicado', async () => {
    findUnique.mockResolvedValue({
      kitchenId: 'kitchen-2',
      kitchen: { isActive: true },
    });

    const result = await service.getAssignedKitchenIdForDate(
      'cook-1',
      new Date(2026, 7, 15),
    );

    expect(result).toBe('kitchen-2');
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_dayOfWeek: {
            userId: 'cook-1',
            dayOfWeek: 'SATURDAY',
          },
        },
      }),
    );
  });

  it('niega acceso cuando la cocina asignada está inactiva', async () => {
    findUnique.mockResolvedValue({
      kitchenId: 'kitchen-2',
      kitchen: { isActive: false },
    });

    await expect(
      service.getAssignedKitchenIdForDate('cook-1'),
    ).resolves.toBeNull();
  });
});

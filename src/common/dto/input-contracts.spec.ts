import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCustomerDto } from '../../customers/dto/create-customer.dto';
import { UpdateCustomerDto } from '../../customers/dto/update-customer.dto';
import { UpdateCookAssignmentsDto } from '../../kitchens/dto/update-cook-assignments.dto';
import { HideKitchenTicketsDto } from '../../orders/dto/hide-kitchen-tickets.dto';
import { CreateCuponDto } from '../../promotions/dto/cupones/create-cupon.dto';
import { UpdateCuponDto } from '../../promotions/dto/cupones/update-cupon.dto';
import { CreateUserExtraDayDto } from '../../users/dto/create-user-extra-day.dto';
import { UpdateUserDto } from '../../users/dto/update-user.dto';
import { UpdateWaiterZonesDto } from '../../users/dto/update-waiter-zones.dto';

describe('DTO contracts for operational mutations', () => {
  it('rejects malformed extra days and waiter zones before reaching the service', async () => {
    const invalidExtraDay = plainToInstance(CreateUserExtraDayDto, {
      date: '2026/11/10',
      notes: 42,
    });
    const invalidZones = plainToInstance(UpdateWaiterZonesDto, {
      zones: [{ day: 'FUNDAY', floor: 0 }],
    });

    expect(await validate(invalidExtraDay)).not.toHaveLength(0);
    expect(await validate(invalidZones)).not.toHaveLength(0);
  });

  it('requires valid kitchen assignments and bounded ticket identifiers', async () => {
    const invalidAssignments = plainToInstance(UpdateCookAssignmentsDto, {
      assignments: [{ dayOfWeek: 'MONDAY', kitchenId: 'not-a-uuid' }],
    });
    const invalidTickets = plainToInstance(HideKitchenTicketsDto, {
      ticketIds: ['ticket-1', 2],
    });

    expect(await validate(invalidAssignments)).not.toHaveLength(0);
    expect(await validate(invalidTickets)).not.toHaveLength(0);
  });

  it('rejects negative coupon usage bounds, invalid workDays enum and blank trimmed customer name (B45, B47, B48)', async () => {
    const negativeCreateCupon = plainToInstance(CreateCuponDto, {
      code: 'PROMO10',
      discountType: 'porcentaje',
      discountValue: 10,
      maxUses: -1,
    });
    const negativeUpdateCupon = plainToInstance(UpdateCuponDto, {
      maxUses: -2,
      currentUses: -1,
    });
    const validZeroCupon = plainToInstance(CreateCuponDto, {
      code: 'UNLIMITED',
      discountType: 'porcentaje',
      discountValue: 10,
      maxUses: 0,
    });
    const invalidWorkDays = plainToInstance(UpdateUserDto, {
      workDays: ['FUNDAY'],
    });
    const validWorkDays = plainToInstance(UpdateUserDto, {
      workDays: ['MONDAY', 'FRIDAY'],
    });
    const blankCustomerName = plainToInstance(UpdateCustomerDto, {
      name: '   ',
    });
    const validCustomer = plainToInstance(CreateCustomerDto, {
      name: 'Ana',
    });

    expect(await validate(negativeCreateCupon)).not.toHaveLength(0);
    expect(await validate(negativeUpdateCupon)).not.toHaveLength(0);
    expect(await validate(validZeroCupon)).toHaveLength(0);
    expect(await validate(invalidWorkDays)).not.toHaveLength(0);
    expect(await validate(validWorkDays)).toHaveLength(0);
    expect(await validate(blankCustomerName)).not.toHaveLength(0);
    expect(await validate(validCustomer)).toHaveLength(0);
  });
});

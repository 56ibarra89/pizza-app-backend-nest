import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCookAssignmentsDto } from '../../kitchens/dto/update-cook-assignments.dto';
import { HideKitchenTicketsDto } from '../../orders/dto/hide-kitchen-tickets.dto';
import { CreateUserExtraDayDto } from '../../users/dto/create-user-extra-day.dto';
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
});

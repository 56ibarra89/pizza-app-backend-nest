import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListOrderHistoryQueryDto } from './list-order-history-query.dto';

describe('ListOrderHistoryQueryDto', () => {
  it('transforms valid pagination and status parameters', async () => {
    const query = plainToInstance(ListOrderHistoryQueryDto, {
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-12T23:59:59.999Z',
      page: '2',
      pageSize: '50',
      search: '  factura-1  ',
      statuses: 'paid,cancelled',
      view: 'invoices',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({
      page: 2,
      pageSize: 50,
      search: 'factura-1',
      statuses: ['paid', 'cancelled'],
      view: 'invoices',
    });
  });

  it('rejects oversized pages and unknown statuses', async () => {
    const query = plainToInstance(ListOrderHistoryQueryDto, {
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-12T23:59:59.999Z',
      page: '1',
      pageSize: '5000',
      statuses: 'paid,unknown',
    });

    const errors = await validate(query);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['pageSize', 'statuses']),
    );
  });
});

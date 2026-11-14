import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientExceptionFilter } from './prisma-client-exception.filter';

describe('PrismaClientExceptionFilter (B43)', () => {
  const createHost = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  };

  it('mapea P2025 -> 404, P2003 -> 400 y P2002 -> 409', () => {
    const filter = new PrismaClientExceptionFilter();

    for (const [code, expectedStatus] of [
      ['P2025', HttpStatus.NOT_FOUND],
      ['P2003', HttpStatus.BAD_REQUEST],
      ['P2002', HttpStatus.CONFLICT],
    ] as const) {
      const { host, status, json } = createHost();
      const error = new Prisma.PrismaClientKnownRequestError('Prisma error', {
        code,
        clientVersion: '6.19.3',
      });
      filter.catch(error, host);
      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: expectedStatus }),
      );
    }
  });
});

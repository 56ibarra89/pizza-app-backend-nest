import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Traduce errores conocidos de Prisma (P2025 registro no encontrado, P2003 clave
 * foránea inválida y P2002 unicidad) en respuestas HTTP 4xx limpias.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error interno al procesar la operación de datos.';

    if (exception.code === 'P2025') {
      statusCode = HttpStatus.NOT_FOUND;
      message = 'El recurso solicitado no existe o ya fue eliminado.';
    } else if (exception.code === 'P2003') {
      statusCode = HttpStatus.BAD_REQUEST;
      message =
        'Referencia inválida a un recurso relacionado inexistente o protegido.';
    } else if (exception.code === 'P2002') {
      statusCode = HttpStatus.CONFLICT;
      message = 'Ya existe un registro con los mismos datos únicos.';
    }

    response.status(statusCode).json({
      statusCode,
      message,
    });
  }
}

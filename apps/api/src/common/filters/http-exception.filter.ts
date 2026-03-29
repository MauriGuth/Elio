import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string | string[]) || exception.message;
        error = (resp.error as string) || exception.name;
      } else {
        message = exception.message;
        error = exception.name;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'InternalServerError';

      const err = exception as { code?: string; message?: string; meta?: Record<string, unknown> };
      const errMsg = (err?.message ?? '').toLowerCase();
      const isPrismaSchemaError =
        err?.code === 'P2010' ||
        err?.code === 'P2021' ||
        (errMsg.includes('column') &&
          (errMsg.includes('does not exist') || errMsg.includes('no existe')));

      if (isPrismaSchemaError) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        message =
          'Esquema de base de datos desactualizado. Ejecute en la API: npx prisma migrate deploy';
        error = 'SchemaOutdated';
      } else if (
        typeof err?.code === 'string' &&
        err.code.startsWith('P') &&
        typeof err.message === 'string'
      ) {
        /** PrismaClientKnownRequestError (sin import del runtime para no acoplar path). */
        switch (err.code) {
          case 'P2002': {
            status = HttpStatus.CONFLICT;
            const target = err.meta?.target;
            const tRaw = Array.isArray(target) ? target.join(', ') : String(target ?? '');
            const t = tRaw.toLowerCase();
            const msg = String(err.message ?? '').toLowerCase();
            const isOrderNumberDup =
              t.includes('order_number') ||
              t.includes('ordernumber') ||
              msg.includes('order_number') ||
              msg.includes('orders_order_number');
            const isShipmentNumberDup =
              t.includes('shipment_number') ||
              msg.includes('shipment_number') ||
              msg.includes('shipments_shipment_number');
            message = isOrderNumberDup
              ? 'Conflicto al numerar el pedido. Reintentá enviar a cocina.'
              : isShipmentNumberDup
                ? 'Ese número de envío ya se usó (varias altas a la vez). Volvé a intentar crear el envío.'
                : `Registro duplicado${tRaw ? ` (${tRaw})` : ''}.`;
            error = 'Conflict';
            break;
          }
          case 'P2003':
            status = HttpStatus.BAD_REQUEST;
            message =
              'Dato inválido o inexistente (ubicación, mesa, producto o usuario). Verificá el local y la sesión.';
            error = 'BadRequest';
            break;
          case 'P2025':
            status = HttpStatus.NOT_FOUND;
            message = 'No se encontró el registro relacionado.';
            error = 'NotFound';
            break;
          default:
            console.error('Unhandled Prisma error:', err.code, err.message, err.meta);
            message =
              process.env.NODE_ENV !== 'production'
                ? `Error de base (${err.code}): ${err.message}`
                : 'Error al guardar en la base de datos. Revisá la consola del servidor.';
            error = 'DatabaseError';
        }
      } else {
        console.error('Unhandled exception:', exception);
      }
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

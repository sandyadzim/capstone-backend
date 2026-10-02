import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ApiErrorException } from './api-error.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

function captureResponse(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const request = { method: 'GET', path: '/api/example' };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  new ApiExceptionFilter().catch(exception, host);

  return { json, status };
}

describe('ApiExceptionFilter', () => {
  it.each([
    [
      new BadRequestException('private validation detail'),
      400,
      'VALIDATION_ERROR',
    ],
    [new UnauthorizedException('private auth detail'), 401, 'UNAUTHORIZED'],
    [new ForbiddenException('private authorization detail'), 403, 'FORBIDDEN'],
    [new NotFoundException('private resource detail'), 404, 'NOT_FOUND'],
    [new ConflictException('private state detail'), 409, 'CONFLICT'],
    [new HttpException('private method detail', 405), 405, 'HTTP_ERROR'],
  ] as const)(
    'normalizes HTTP status %i to its public error code',
    (exception, statusCode, code) => {
      const { json, status } = captureResponse(exception);

      expect(status).toHaveBeenCalledWith(statusCode);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode, code }),
      );
      expect(JSON.stringify(json.mock.calls[0])).not.toContain('private');
    },
  );

  it('preserves the safe structured validation issues', () => {
    const { json, status } = captureResponse(
      new ApiErrorException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: {
          issues: [{ path: ['loginIdentifier'], message: 'Required' }],
        },
      }),
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        issues: [{ path: ['loginIdentifier'], message: 'Required' }],
      },
    });
  });

  it('hides unexpected server errors from the response and logs them', () => {
    const logger = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    try {
      const { json, status } = captureResponse(
        new Error('private database connection string'),
      );

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
      expect(JSON.stringify(json.mock.calls[0])).not.toContain('private');
      expect(logger).toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });
});

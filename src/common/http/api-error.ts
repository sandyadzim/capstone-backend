import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
  'HTTP_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ValidationIssue {
  path: string[];
  message: string;
}

export interface ApiErrorBody {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: {
    issues: ValidationIssue[];
  };
}

export class ApiValidationIssueDto implements ValidationIssue {
  @ApiProperty({ type: [String], example: ['loginIdentifier'] })
  path!: string[];

  @ApiProperty({ example: 'Invalid login identifier' })
  message!: string;
}

export class ApiErrorDetailsDto {
  @ApiProperty({ type: [ApiValidationIssueDto] })
  issues!: ApiValidationIssueDto[];
}

export class ApiErrorResponseDto implements ApiErrorBody {
  @ApiProperty({ example: HttpStatus.BAD_REQUEST })
  statusCode!: number;

  @ApiProperty({ enum: API_ERROR_CODES, example: 'VALIDATION_ERROR' })
  code!: ApiErrorCode;

  @ApiProperty({ example: 'Request validation failed' })
  message!: string;

  @ApiPropertyOptional({ type: ApiErrorDetailsDto })
  details?: ApiErrorDetailsDto;
}

export class ApiErrorException extends HttpException {
  constructor(body: ApiErrorBody) {
    super(body, body.statusCode);
  }
}

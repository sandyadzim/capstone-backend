import { ApiProperty } from '@nestjs/swagger';

export class AttachmentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uri' }) fileUrl!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

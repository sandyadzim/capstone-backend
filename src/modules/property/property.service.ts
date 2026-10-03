import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PropertyRepository } from './property.repository.js';
import type { PropertyPatchInput } from './property.schemas.js';
import type { PropertyResponseDto } from './property.dto.js';

@Injectable()
export class PropertyService {
  constructor(private readonly repository: PropertyRepository) {}
  async get(): Promise<PropertyResponseDto> {
    const property = await this.repository.findProperty();
    if (!property) {
      throw new NotFoundException();
    }
    return property;
  }

  async update(input: PropertyPatchInput): Promise<PropertyResponseDto> {
    const property = await this.repository.updateProperty(input);
    if (!property) {
      throw new NotFoundException();
    }
    return property;
  }
  // Internal only: BE-11 must verify the upload callback and Admin authorization
  // before calling this. No HTTP route accepts a client-supplied logo URL.
  async updateLogoFromVerifiedUpload(
    url: string,
  ): Promise<PropertyResponseDto> {
    const logoUrl = z.url({ protocol: /^https$/ }).parse(url);
    const property = await this.repository.updateProperty({ logoUrl });
    if (!property) {
      throw new NotFoundException();
    }
    return property;
  }
}

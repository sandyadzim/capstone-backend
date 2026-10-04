import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  // Internal only: callers must upload and verify the file before calling this.
  async updateLogoFromVerifiedUpload(
    actorId: string,
    url: string,
  ): Promise<{ property: PropertyResponseDto; previousUrl: string | null }> {
    const logoUrl = z.url({ protocol: /^https$/ }).parse(url);
    const result = await this.repository.updateLogoFromVerifiedUpload(
      actorId,
      logoUrl,
    );
    if (result.kind === 'actor-changed') throw new ForbiddenException();
    if (result.kind === 'property-not-found') {
      throw new NotFoundException();
    }
    return { property: result.property, previousUrl: result.previousUrl };
  }
}

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import type {
  Database,
  DatabaseTransaction,
} from '../database/database.service.js';
import { properties } from '../database/schema.js';
import { users } from '../database/schema.js';
import { INITIAL_PROPERTY_ID } from './property.constants.js';
import type { PropertyPatchInput } from './property.schemas.js';

type Executor = Database | DatabaseTransaction;

@Injectable()
export class PropertyRepository {
  constructor(private readonly database: DatabaseService) {}

  async findProperty(executor: Executor = this.database.db) {
    const [property] = await executor
      .select()
      .from(properties)
      .where(eq(properties.id, INITIAL_PROPERTY_ID));
    return property;
  }

  async updateProperty(
    input: PropertyPatchInput | { logoUrl: string },
    executor: Executor = this.database.db,
  ) {
    const [property] = await executor
      .update(properties)
      .set(input)
      .where(eq(properties.id, INITIAL_PROPERTY_ID))
      .returning();
    return property;
  }

  async updateLogoFromVerifiedUpload(actorId: string, logoUrl: string) {
    return this.database.transaction(async (transaction) => {
      const [actor] = await transaction
        .select({ role: users.role, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, actorId))
        .for('update');
      if (!actor?.isActive || actor.role !== 'ADMIN') {
        return { kind: 'actor-changed' as const };
      }

      const [property] = await transaction
        .select({ logoUrl: properties.logoUrl })
        .from(properties)
        .where(eq(properties.id, INITIAL_PROPERTY_ID))
        .for('update');
      if (!property) return { kind: 'property-not-found' as const };
      const [updated] = await transaction
        .update(properties)
        .set({ logoUrl })
        .where(eq(properties.id, INITIAL_PROPERTY_ID))
        .returning();
      return {
        kind: 'saved' as const,
        property: updated,
        previousUrl: property.logoUrl,
      };
    });
  }
}

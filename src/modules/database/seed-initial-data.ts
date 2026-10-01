import { sql } from 'drizzle-orm';
import type { Database } from './database.service.js';
import { properties, users } from './schema.js';
import { normalizeLoginIdentifier } from './users.repository.js';

const INITIAL_PROPERTY_ID = '11000000-0000-4000-8000-000000000001';

export interface InitialSeedInput {
  propertyName: string;
  propertyAddress: string;
  adminName: string;
  adminLoginIdentifier: string;
  adminPassword: string;
}

export interface InitialSeedResult {
  propertyId: string;
  adminId: string;
  adminCreated: boolean;
}

type PasswordHasher = (password: string) => Promise<string>;

export async function seedInitialData(
  database: Database,
  input: InitialSeedInput,
  hashPassword: PasswordHasher,
): Promise<InitialSeedResult> {
  const propertyName = input.propertyName.trim();
  const propertyAddress = input.propertyAddress.trim();
  const adminName = input.adminName.trim();
  const loginIdentifier = normalizeLoginIdentifier(input.adminLoginIdentifier);

  if (!propertyName || propertyName.length > 160) {
    throw new Error('SEED_PROPERTY_NAME must contain 1 to 160 characters');
  }
  if (!propertyAddress) {
    throw new Error('SEED_PROPERTY_ADDRESS must not be empty');
  }
  if (!adminName || adminName.length > 160) {
    throw new Error('SEED_ADMIN_NAME must contain 1 to 160 characters');
  }

  const [existingAdmin] = await database
    .select()
    .from(users)
    .where(sql`lower(${users.loginIdentifier}) = ${loginIdentifier}`)
    .limit(1);

  if (existingAdmin && existingAdmin.role !== 'ADMIN') {
    throw new Error(
      'SEED_ADMIN_LOGIN_IDENTIFIER is already assigned to a non-admin account',
    );
  }

  let passwordHash = existingAdmin
    ? undefined
    : await hashPassword(input.adminPassword);

  return database.transaction(async (transaction) => {
    await transaction
      .insert(properties)
      .values({
        id: INITIAL_PROPERTY_ID,
        name: propertyName,
        address: propertyAddress,
      })
      .onConflictDoNothing();

    const [admin] = await transaction
      .select()
      .from(users)
      .where(sql`lower(${users.loginIdentifier}) = ${loginIdentifier}`)
      .limit(1);

    if (admin) {
      if (admin.role !== 'ADMIN') {
        throw new Error(
          'SEED_ADMIN_LOGIN_IDENTIFIER is already assigned to a non-admin account',
        );
      }

      return {
        propertyId: INITIAL_PROPERTY_ID,
        adminId: admin.id,
        adminCreated: false,
      };
    }

    passwordHash ??= await hashPassword(input.adminPassword);

    const [createdAdmin] = await transaction
      .insert(users)
      .values({
        name: adminName,
        loginIdentifier,
        passwordHash,
        role: 'ADMIN',
      })
      .onConflictDoNothing()
      .returning({ id: users.id });

    if (createdAdmin) {
      return {
        propertyId: INITIAL_PROPERTY_ID,
        adminId: createdAdmin.id,
        adminCreated: true,
      };
    }

    const [concurrentAdmin] = await transaction
      .select()
      .from(users)
      .where(sql`lower(${users.loginIdentifier}) = ${loginIdentifier}`)
      .limit(1);

    if (!concurrentAdmin || concurrentAdmin.role !== 'ADMIN') {
      throw new Error('Unable to create the initial Admin account');
    }

    return {
      propertyId: INITIAL_PROPERTY_ID,
      adminId: concurrentAdmin.id,
      adminCreated: false,
    };
  });
}

import 'dotenv/config';
import { password } from 'bun';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { z } from 'zod';
import { schema } from '../src/modules/database/schema.js';
import { seedInitialData } from '../src/modules/database/seed-initial-data.js';

const seedEnvironmentSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  SEED_PROPERTY_NAME: z.string().trim().min(1).max(160),
  SEED_PROPERTY_ADDRESS: z.string().trim().min(1),
  SEED_ADMIN_NAME: z.string().trim().min(1).max(160),
  SEED_ADMIN_LOGIN_IDENTIFIER: z.string().trim().min(1).max(254),
  SEED_ADMIN_PASSWORD: z.string().min(4).max(30),
});

const environment = seedEnvironmentSchema.safeParse(process.env);
if (!environment.success) {
  const missingOrInvalid = [
    ...new Set(environment.error.issues.map((issue) => issue.path.join('.'))),
  ];
  throw new Error(
    `Invalid seed environment configuration: ${missingOrInvalid.join(', ')}`,
  );
}

const client = postgres(environment.data.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
});

try {
  const database = drizzle(client, { schema });
  const result = await seedInitialData(
    database,
    {
      propertyName: environment.data.SEED_PROPERTY_NAME,
      propertyAddress: environment.data.SEED_PROPERTY_ADDRESS,
      adminName: environment.data.SEED_ADMIN_NAME,
      adminLoginIdentifier: environment.data.SEED_ADMIN_LOGIN_IDENTIFIER,
      adminPassword: environment.data.SEED_ADMIN_PASSWORD,
    },
    (rawPassword) =>
      password.hash(rawPassword, {
        algorithm: 'argon2id',
        memoryCost: 19_456,
        timeCost: 2,
      }),
  );

  console.info(
    `Initial property is ready; Admin ${result.adminCreated ? 'created' : 'already exists'}.`,
  );
} finally {
  await client.end({ timeout: 5 });
}

import 'dotenv/config';

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    'DATABASE_URL must be set before applying database migrations',
  );
}

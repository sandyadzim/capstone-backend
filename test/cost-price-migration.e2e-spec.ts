import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('migrates legacy costs without changing report totals, identities or audit dates', async () => {
  const db = new PGlite();
  try {
    for (const name of [
      '0000_initial_schema',
      '0001_auth_sessions',
      '0002_damage_report_number_sequence',
      '0003_curvy_talkback',
      '0004_breezy_ezekiel_stane',
    ]) {
      await db.exec(await readFile(resolve('drizzle', `${name}.sql`), 'utf8'));
    }
    await db.exec(`
      INSERT INTO properties (id,name,address) VALUES ('10000000-0000-4000-8000-000000000001','Migration fixture','Fixture');
      INSERT INTO users (id,name,login_identifier,password_hash,role) VALUES ('20000000-0000-4000-8000-000000000001','Fixture','fixture','unused','ADMIN');
      INSERT INTO units (id,property_id,unit_number,floor) VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A-1',1);
      INSERT INTO damage_reports (id,unit_id,report_number,title,description,category,status,created_by_user_id,reported_by_user_id)
        SELECT ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'30000000-0000-4000-8000-000000000001','M-'||n,'Fixture','Fixture','OTHER','REPORTED','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001' FROM generate_series(1,4) n;
      INSERT INTO cost_items (id,report_id,type,description,quantity,unit_price,created_at,updated_at) VALUES
        ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','SERVICE','First half cent',0.001,5,'2026-01-01','2026-02-01'),
        ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','MATERIAL','Second half cent',0.001,5,'2026-01-01','2026-02-01'),
        ('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','SERVICE','Largest legacy charge',999999999.999,999999999999.99,'2026-01-01','2026-02-01'),
        ('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000002','MATERIAL','Zero',1,0,'2026-01-01','2026-02-01'),
        ('50000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000003','SERVICE','Ordinary charge',2,125000.50,'2026-01-01','2026-02-01');
    `);
    const before = await db.query(
      'SELECT report_id,round(sum(quantity*unit_price),2)::text AS total FROM cost_items GROUP BY report_id ORDER BY report_id',
    );
    const audits = await db.query<{ updated_at: Date; [key: string]: unknown }>(
      'SELECT id,report_id,type,description,created_at,updated_at FROM cost_items ORDER BY id',
    );
    await db.exec('BEGIN');
    await db.exec(
      await readFile(resolve('drizzle/0005_cost_item_prices.sql'), 'utf8'),
    );
    await db.exec('COMMIT');
    const after = await db.query(
      'SELECT report_id,sum(price)::text AS total FROM cost_items GROUP BY report_id ORDER BY report_id',
    );
    expect(after.rows).toEqual(before.rows);
    const rows = await db.query<{ price: string; updated_at: Date }>(
      'SELECT price::text,updated_at FROM cost_items ORDER BY id',
    );
    expect(rows.rows.map((row) => row.price).slice(0, 2)).toEqual([
      '0.01',
      '0.00',
    ]);
    expect(rows.rows).toHaveLength(5);
    expect(
      (
        await db.query(
          'SELECT id,report_id,type,description,created_at,updated_at FROM cost_items ORDER BY id',
        )
      ).rows,
    ).toEqual(audits.rows);
    const columns = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name='cost_items'",
    );
    expect(columns.rows.map((row) => row.column_name)).toContain('price');
    expect(columns.rows.map((row) => row.column_name)).not.toContain(
      'quantity',
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain(
      'unit_price',
    );
    await expect(db.exec('UPDATE cost_items SET price=-1')).rejects.toThrow();
    await db.exec(
      "UPDATE cost_items SET price=1 WHERE id='50000000-0000-4000-8000-000000000004'",
    );
    const updated = await db.query<{ updated_at: Date }>(
      "SELECT updated_at FROM cost_items WHERE id='50000000-0000-4000-8000-000000000004'",
    );
    expect(updated.rows[0].updated_at).not.toEqual(audits.rows[3].updated_at);
  } finally {
    await db.close();
  }
});

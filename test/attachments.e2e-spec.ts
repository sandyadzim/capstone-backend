import { eq } from 'drizzle-orm';
import {
  assignments,
  attachments,
  properties,
} from '../src/modules/database/schema.js';
import { usePropertyUnitsContext } from './support/property-units-context.js';

describe('Attachments API (e2e)', () => {
  const ctx = usePropertyUnitsContext();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('uploads a Resident damage photo, stores its URL, and returns it on report detail', async () => {
    const unit = await ctx.createUnit('ATTACH-RESIDENT-01', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const report = await ctx.addReport(unit.id);

    const uploaded = await ctx
      .api('post', `/api/reports/${report.id}/damage-photos`, 'RESIDENT')
      .attach('file', png, { filename: 'damage.png', contentType: 'image/png' })
      .expect(201);
    expect(uploaded.body).toMatchObject({
      id: expect.any(String),
      fileUrl: 'https://test-app.ufs.sh/f/test-file-1.png',
    });
    const [saved] = await ctx.db
      .select()
      .from(attachments)
      .where(eq(attachments.reportId, report.id));
    expect(saved).toMatchObject({
      purpose: 'DAMAGE_PHOTO',
      fileUrl: uploaded.body.fileUrl,
    });
    const detail = await ctx
      .api('get', `/api/reports/${report.id}`, 'RESIDENT')
      .expect(200);
    expect(detail.body.damagePhotos[0].fileUrl).toBe(uploaded.body.fileUrl);
    expect(ctx.storage.upload).toHaveBeenCalledTimes(1);
  });

  it('requires a session and limits damage photos to the Resident unit or Admin', async () => {
    const unit = await ctx.createUnit('ATTACH-AUTH-01');
    const report = await ctx.addReport(unit.id);
    const path = `/api/reports/${report.id}/damage-photos`;

    await ctx
      .api('post', path, null)
      .attach('file', png, 'damage.png')
      .expect(401);
    await ctx
      .api('post', path, 'TECHNICIAN')
      .attach('file', png, 'damage.png')
      .expect(403);
    expect(ctx.storage.upload).not.toHaveBeenCalled();

    const residentOtherUnit = await ctx.createUnit('ATTACH-AUTH-OTHER-UNIT');
    const residentOtherReport = await ctx.addReport(residentOtherUnit.id);
    await ctx
      .api(
        'post',
        `/api/reports/${residentOtherReport.id}/damage-photos`,
        'RESIDENT',
      )
      .attach('file', png, 'damage.png')
      .expect(404);
    expect(ctx.storage.upload).not.toHaveBeenCalled();

    const residentUnit = await ctx.createUnit('ATTACH-AUTH-02', {
      activeResidentUserId: ctx.ids.actorIds.RESIDENT,
    });
    const unrelatedReport = await ctx.addReport(residentUnit.id);
    await ctx
      .api(
        'post',
        `/api/reports/${unrelatedReport.id}/damage-photos`,
        'RESIDENT',
      )
      .attach('file', png, 'damage.png')
      .expect(201);
  });

  it('validates file content and cleans up a file when a per-report photo limit is reached', async () => {
    const unit = await ctx.createUnit('ATTACH-LIMIT-01');
    const report = await ctx.addReport(unit.id);
    await ctx.db.insert(attachments).values(
      Array.from({ length: 5 }, (_, index) => ({
        reportId: report.id,
        purpose: 'DAMAGE_PHOTO' as const,
        fileUrl: `https://test-app.ufs.sh/f/existing-${index}.png`,
      })),
    );
    const path = `/api/reports/${report.id}/damage-photos`;

    await ctx
      .api('post', path)
      .attach('file', Buffer.from('not an image'), {
        filename: 'bad.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(ctx.storage.upload).not.toHaveBeenCalled();

    const oversized = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
    await ctx
      .api('post', path)
      .attach('file', oversized, 'large.png')
      .expect(413);
    expect(ctx.storage.upload).not.toHaveBeenCalled();

    await ctx.api('post', path).attach('file', png, 'damage.png').expect(409);
    expect(ctx.storage.upload).toHaveBeenCalledTimes(1);
    expect(ctx.storage.delete).toHaveBeenCalledWith('test-file-1.png');
  });

  it('serializes concurrent uploads at the per-report photo limit', async () => {
    const unit = await ctx.createUnit('ATTACH-CONCURRENT-01');
    const report = await ctx.addReport(unit.id);
    await ctx.db.insert(attachments).values(
      Array.from({ length: 4 }, (_, index) => ({
        reportId: report.id,
        purpose: 'DAMAGE_PHOTO' as const,
        fileUrl: `https://test-app.ufs.sh/f/concurrent-existing-${index}.png`,
      })),
    );
    const path = `/api/reports/${report.id}/damage-photos`;
    const responses = await Promise.all([
      ctx.api('post', path).attach('file', png, 'one.png'),
      ctx.api('post', path).attach('file', png, 'two.png'),
    ]);
    expect(
      responses.map((response) => response.status).sort((left, right) => left - right),
    ).toEqual([
      201, 409,
    ]);
    const saved = await ctx.db
      .select()
      .from(attachments)
      .where(eq(attachments.reportId, report.id));
    expect(saved).toHaveLength(5);
    expect(ctx.storage.delete).toHaveBeenCalledTimes(1);
  });

  it('stores technician repair photos and receipt, then exposes both on detail', async () => {
    const unit = await ctx.createUnit('ATTACH-TECH-01');
    const report = await ctx.addReport(unit.id, 'IN_PROGRESS');
    await ctx.db.insert(assignments).values({
      reportId: report.id,
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
    });

    const repair = await ctx
      .api('post', `/api/reports/${report.id}/repair-photos`, 'TECHNICIAN')
      .attach('file', png, 'repair.png')
      .expect(201);
    const receiptBytes = Buffer.from('%PDF-1.7 test');
    const receipt = await ctx
      .api('put', `/api/reports/${report.id}/receipt`, 'TECHNICIAN')
      .attach('file', receiptBytes, {
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);
    const detail = await ctx
      .api('get', `/api/reports/${report.id}`, 'TECHNICIAN')
      .expect(200);
    expect(detail.body.repairPhotos[0].fileUrl).toBe(repair.body.fileUrl);
    expect(detail.body.receipt.fileUrl).toBe(receipt.body.fileUrl);
  });

  it('replaces an existing receipt and logo after saving the new URL', async () => {
    const unit = await ctx.createUnit('ATTACH-REPLACE-01');
    const report = await ctx.addReport(unit.id, 'IN_PROGRESS');
    await ctx.db.insert(assignments).values({
      reportId: report.id,
      technicianUserId: ctx.ids.actorIds.TECHNICIAN,
      assignedByUserId: ctx.ids.actorIds.ADMIN,
    });
    await ctx.db.insert(attachments).values({
      reportId: report.id,
      purpose: 'RECEIPT',
      fileUrl: 'https://test-app.ufs.sh/f/old-receipt.pdf',
    });
    const receipt = await ctx
      .api('put', `/api/reports/${report.id}/receipt`, 'TECHNICIAN')
      .attach('file', Buffer.from('%PDF-1.7 new'), {
        filename: 'receipt.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);
    expect(ctx.storage.deleteByUrl).toHaveBeenCalledWith(
      'https://test-app.ufs.sh/f/old-receipt.pdf',
    );
    expect(
      (
        await ctx.db
          .select()
          .from(attachments)
          .where(eq(attachments.reportId, report.id))
      ).map((row) => row.fileUrl),
    ).toEqual([receipt.body.fileUrl]);

    await ctx.db
      .update(properties)
      .set({ logoUrl: 'https://test-app.ufs.sh/f/old-logo.png' })
      .where(eq(properties.id, ctx.ids.INITIAL_PROPERTY_ID));
    const logo = await ctx
      .api('put', '/api/property/logo')
      .attach('file', png, 'logo.png')
      .expect(200);
    expect(logo.body.logoUrl).toBe('https://test-app.ufs.sh/f/test-file-2.png');
    expect(ctx.storage.deleteByUrl).toHaveBeenCalledWith(
      'https://test-app.ufs.sh/f/old-logo.png',
    );
  });
});

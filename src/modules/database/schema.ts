import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export type UserRole = 'ADMIN' | 'TECHNICIAN' | 'RESIDENT';
export type DamageCategory =
  'AC' | 'ELECTRICAL' | 'PLUMBING' | 'FURNITURE' | 'BUILDING' | 'OTHER';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type DamageReportStatus =
  | 'REPORTED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED';
export type CostItemType = 'SERVICE' | 'MATERIAL';
export type AttachmentPurpose = 'DAMAGE_PHOTO' | 'REPAIR_PHOTO' | 'RECEIPT';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
};

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    address: text('address').notNull(),
    logoUrl: text('logo_url'),
    ...timestamps,
  },
  (table) => [
    check('ck_properties_name_nonblank', sql`length(btrim(${table.name})) > 0`),
    check(
      'ck_properties_address_nonblank',
      sql`length(btrim(${table.address})) > 0`,
    ),
    uniqueIndex('uk_properties_logo_url').on(table.logoUrl),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    loginIdentifier: varchar('login_identifier', { length: 254 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).$type<UserRole>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    check('ck_users_name_nonblank', sql`length(btrim(${table.name})) > 0`),
    check(
      'ck_users_login_identifier_normalized',
      sql`${table.loginIdentifier} = lower(btrim(${table.loginIdentifier})) AND length(btrim(${table.loginIdentifier})) > 0`,
    ),
    check(
      'ck_users_role',
      sql`${table.role} IN ('ADMIN', 'TECHNICIAN', 'RESIDENT')`,
    ),
    uniqueIndex('uk_users_login_lower').on(
      sql`lower(${table.loginIdentifier})`,
    ),
  ],
);

export const units = pgTable(
  'units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'restrict' }),
    unitNumber: varchar('unit_number', { length: 40 }).notNull(),
    floor: smallint('floor').notNull(),
    maintenanceFlag: boolean('maintenance_flag').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    activeResidentUserId: uuid('active_resident_user_id').references(
      () => users.id,
      { onDelete: 'restrict' },
    ),
    ...timestamps,
  },
  (table) => [
    check(
      'ck_units_unit_number_nonblank',
      sql`length(btrim(${table.unitNumber})) > 0`,
    ),
    uniqueIndex('uk_units_property_number').on(
      table.propertyId,
      table.unitNumber,
    ),
    uniqueIndex('uk_units_active_resident').on(table.activeResidentUserId),
  ],
);

export const damageReports = pgTable(
  'damage_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportNumber: varchar('report_number', { length: 32 }).notNull(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reportedByUserId: uuid('reported_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    closedByUserId: uuid('closed_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description').notNull(),
    category: varchar('category', { length: 20 })
      .$type<DamageCategory>()
      .notNull(),
    proposedPriority: varchar('proposed_priority', {
      length: 10,
    }).$type<Priority>(),
    finalPriority: varchar('final_priority', { length: 10 }).$type<Priority>(),
    status: varchar('status', { length: 20 })
      .$type<DamageReportStatus>()
      .notNull(),
    rejectionReason: text('rejection_reason'),
    reportedAt: timestamp('reported_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    ...timestamps,
  },
  (table) => [
    check(
      'ck_damage_reports_report_number_nonblank',
      sql`length(btrim(${table.reportNumber})) > 0`,
    ),
    check(
      'ck_damage_reports_creator_equals_reporter',
      sql`${table.createdByUserId} = ${table.reportedByUserId}`,
    ),
    check(
      'ck_damage_reports_title_nonblank',
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      'ck_damage_reports_description_nonblank',
      sql`length(btrim(${table.description})) > 0`,
    ),
    check(
      'ck_damage_reports_category',
      sql`${table.category} IN ('AC', 'ELECTRICAL', 'PLUMBING', 'FURNITURE', 'BUILDING', 'OTHER')`,
    ),
    check(
      'ck_damage_reports_proposed_priority',
      sql`${table.proposedPriority} IS NULL OR ${table.proposedPriority} IN ('LOW', 'MEDIUM', 'HIGH')`,
    ),
    check(
      'ck_damage_reports_final_priority',
      sql`${table.finalPriority} IS NULL OR ${table.finalPriority} IN ('LOW', 'MEDIUM', 'HIGH')`,
    ),
    check(
      'ck_damage_reports_status',
      sql`${table.status} IN ('REPORTED', 'VERIFIED', 'REJECTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED')`,
    ),
    check(
      'ck_damage_reports_final_priority_by_status',
      sql`(${table.status} = 'REPORTED' AND ${table.finalPriority} IS NULL) OR (${table.status} <> 'REPORTED' AND ${table.finalPriority} IS NOT NULL)`,
    ),
    check(
      'ck_damage_reports_rejection_details',
      sql`${table.status} <> 'REJECTED' OR (${table.reviewedByUserId} IS NOT NULL AND ${table.rejectionReason} IS NOT NULL AND length(btrim(${table.rejectionReason})) > 0)`,
    ),
    check(
      'ck_damage_reports_closure_details',
      sql`(${table.status} = 'CLOSED' AND ${table.closedAt} IS NOT NULL AND ${table.closedByUserId} IS NOT NULL) OR (${table.status} <> 'CLOSED' AND ${table.closedAt} IS NULL AND ${table.closedByUserId} IS NULL)`,
    ),
    uniqueIndex('uk_reports_number').on(table.reportNumber),
    index('ix_reports_unit_status_date').on(
      table.unitId,
      table.status,
      table.reportedAt.desc(),
    ),
    index('ix_reports_status_date').on(table.status, table.reportedAt.desc()),
    index('ix_reports_creator_date').on(
      table.createdByUserId,
      table.reportedAt.desc(),
    ),
  ],
);

export const assignments = pgTable(
  'assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => damageReports.id, { onDelete: 'restrict' }),
    technicianUserId: uuid('technician_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedByUserId: uuid('assigned_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    estimatedArrivalAt: timestamp('estimated_arrival_at', {
      withTimezone: true,
      mode: 'date',
    }),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('uk_assignments_report').on(table.reportId),
    index('ix_assignments_technician').on(
      table.technicianUserId,
      table.assignedAt.desc(),
    ),
  ],
);

export const maintenanceResults = pgTable(
  'maintenance_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => damageReports.id, { onDelete: 'restrict' }),
    inspectionResult: text('inspection_result').notNull(),
    problemFound: text('problem_found').notNull(),
    repairAction: text('repair_action').notNull(),
    additionalNotes: text('additional_notes'),
    ...timestamps,
  },
  (table) => [
    check(
      'ck_maintenance_results_inspection_result_nonblank',
      sql`length(btrim(${table.inspectionResult})) > 0`,
    ),
    check(
      'ck_maintenance_results_problem_found_nonblank',
      sql`length(btrim(${table.problemFound})) > 0`,
    ),
    check(
      'ck_maintenance_results_repair_action_nonblank',
      sql`length(btrim(${table.repairAction})) > 0`,
    ),
    uniqueIndex('uk_results_report').on(table.reportId),
  ],
);

export const costItems = pgTable(
  'cost_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => damageReports.id, { onDelete: 'restrict' }),
    type: varchar('type', { length: 12 }).$type<CostItemType>().notNull(),
    description: varchar('description', { length: 240 }).notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    ...timestamps,
  },
  (table) => [
    check('ck_cost_items_type', sql`${table.type} IN ('SERVICE', 'MATERIAL')`),
    check(
      'ck_cost_items_description_nonblank',
      sql`length(btrim(${table.description})) > 0`,
    ),
    check('ck_cost_items_quantity_positive', sql`${table.quantity} > 0`),
    check('ck_cost_items_unit_price_nonnegative', sql`${table.unitPrice} >= 0`),
    index('ix_cost_items_report').on(table.reportId),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => damageReports.id, { onDelete: 'restrict' }),
    purpose: varchar('purpose', { length: 20 })
      .$type<AttachmentPurpose>()
      .notNull(),
    fileUrl: text('file_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'ck_attachments_purpose',
      sql`${table.purpose} IN ('DAMAGE_PHOTO', 'REPAIR_PHOTO', 'RECEIPT')`,
    ),
    check(
      'ck_attachments_file_url_nonblank',
      sql`length(btrim(${table.fileUrl})) > 0`,
    ),
    uniqueIndex('uk_attachments_file_url').on(table.fileUrl),
    uniqueIndex('uk_attachments_one_receipt')
      .on(table.reportId)
      .where(sql`${table.purpose} = 'RECEIPT'`),
    index('ix_attachments_report_purpose').on(table.reportId, table.purpose),
  ],
);

export const schema = {
  properties,
  users,
  units,
  damageReports,
  assignments,
  maintenanceResults,
  costItems,
  attachments,
};

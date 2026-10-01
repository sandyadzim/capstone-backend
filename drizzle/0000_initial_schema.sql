CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"technician_user_id" uuid NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"estimated_arrival_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"purpose" varchar(20) NOT NULL,
	"file_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_attachments_purpose" CHECK ("attachments"."purpose" IN ('DAMAGE_PHOTO', 'REPAIR_PHOTO', 'RECEIPT')),
	CONSTRAINT "ck_attachments_file_url_nonblank" CHECK (length(btrim("attachments"."file_url")) > 0)
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"type" varchar(12) NOT NULL,
	"description" varchar(240) NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_cost_items_type" CHECK ("cost_items"."type" IN ('SERVICE', 'MATERIAL')),
	CONSTRAINT "ck_cost_items_description_nonblank" CHECK (length(btrim("cost_items"."description")) > 0),
	CONSTRAINT "ck_cost_items_quantity_positive" CHECK ("cost_items"."quantity" > 0),
	CONSTRAINT "ck_cost_items_unit_price_nonnegative" CHECK ("cost_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "damage_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_number" varchar(32) NOT NULL,
	"unit_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"reviewed_by_user_id" uuid,
	"closed_by_user_id" uuid,
	"title" varchar(160) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(20) NOT NULL,
	"proposed_priority" varchar(10),
	"final_priority" varchar(10),
	"status" varchar(20) NOT NULL,
	"rejection_reason" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_damage_reports_report_number_nonblank" CHECK (length(btrim("damage_reports"."report_number")) > 0),
	CONSTRAINT "ck_damage_reports_creator_equals_reporter" CHECK ("damage_reports"."created_by_user_id" = "damage_reports"."reported_by_user_id"),
	CONSTRAINT "ck_damage_reports_title_nonblank" CHECK (length(btrim("damage_reports"."title")) > 0),
	CONSTRAINT "ck_damage_reports_description_nonblank" CHECK (length(btrim("damage_reports"."description")) > 0),
	CONSTRAINT "ck_damage_reports_category" CHECK ("damage_reports"."category" IN ('AC', 'ELECTRICAL', 'PLUMBING', 'FURNITURE', 'BUILDING', 'OTHER')),
	CONSTRAINT "ck_damage_reports_proposed_priority" CHECK ("damage_reports"."proposed_priority" IS NULL OR "damage_reports"."proposed_priority" IN ('LOW', 'MEDIUM', 'HIGH')),
	CONSTRAINT "ck_damage_reports_final_priority" CHECK ("damage_reports"."final_priority" IS NULL OR "damage_reports"."final_priority" IN ('LOW', 'MEDIUM', 'HIGH')),
	CONSTRAINT "ck_damage_reports_status" CHECK ("damage_reports"."status" IN ('REPORTED', 'VERIFIED', 'REJECTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED')),
	CONSTRAINT "ck_damage_reports_final_priority_by_status" CHECK (("damage_reports"."status" = 'REPORTED' AND "damage_reports"."final_priority" IS NULL) OR ("damage_reports"."status" <> 'REPORTED' AND "damage_reports"."final_priority" IS NOT NULL)),
	CONSTRAINT "ck_damage_reports_rejection_details" CHECK ("damage_reports"."status" <> 'REJECTED' OR ("damage_reports"."reviewed_by_user_id" IS NOT NULL AND "damage_reports"."rejection_reason" IS NOT NULL AND length(btrim("damage_reports"."rejection_reason")) > 0)),
	CONSTRAINT "ck_damage_reports_closure_details" CHECK (("damage_reports"."status" = 'CLOSED' AND "damage_reports"."closed_at" IS NOT NULL AND "damage_reports"."closed_by_user_id" IS NOT NULL) OR ("damage_reports"."status" <> 'CLOSED' AND "damage_reports"."closed_at" IS NULL AND "damage_reports"."closed_by_user_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "maintenance_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"inspection_result" text NOT NULL,
	"problem_found" text NOT NULL,
	"repair_action" text NOT NULL,
	"additional_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_maintenance_results_inspection_result_nonblank" CHECK (length(btrim("maintenance_results"."inspection_result")) > 0),
	CONSTRAINT "ck_maintenance_results_problem_found_nonblank" CHECK (length(btrim("maintenance_results"."problem_found")) > 0),
	CONSTRAINT "ck_maintenance_results_repair_action_nonblank" CHECK (length(btrim("maintenance_results"."repair_action")) > 0)
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"address" text NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_properties_name_nonblank" CHECK (length(btrim("properties"."name")) > 0),
	CONSTRAINT "ck_properties_address_nonblank" CHECK (length(btrim("properties"."address")) > 0)
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_number" varchar(40) NOT NULL,
	"floor" smallint NOT NULL,
	"maintenance_flag" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"active_resident_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_units_unit_number_nonblank" CHECK (length(btrim("units"."unit_number")) > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"login_identifier" varchar(254) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_users_name_nonblank" CHECK (length(btrim("users"."name")) > 0),
	CONSTRAINT "ck_users_login_identifier_normalized" CHECK ("users"."login_identifier" = lower(btrim("users"."login_identifier")) AND length(btrim("users"."login_identifier")) > 0),
	CONSTRAINT "ck_users_role" CHECK ("users"."role" IN ('ADMIN', 'TECHNICIAN', 'RESIDENT'))
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_report_id_damage_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."damage_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_technician_user_id_users_id_fk" FOREIGN KEY ("technician_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_report_id_damage_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."damage_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_report_id_damage_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."damage_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_results" ADD CONSTRAINT "maintenance_results_report_id_damage_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."damage_reports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_active_resident_user_id_users_id_fk" FOREIGN KEY ("active_resident_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uk_assignments_report" ON "assignments" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "ix_assignments_technician" ON "assignments" USING btree ("technician_user_id","assigned_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uk_attachments_file_url" ON "attachments" USING btree ("file_url");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_attachments_one_receipt" ON "attachments" USING btree ("report_id") WHERE "attachments"."purpose" = 'RECEIPT';--> statement-breakpoint
CREATE INDEX "ix_attachments_report_purpose" ON "attachments" USING btree ("report_id","purpose");--> statement-breakpoint
CREATE INDEX "ix_cost_items_report" ON "cost_items" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_reports_number" ON "damage_reports" USING btree ("report_number");--> statement-breakpoint
CREATE INDEX "ix_reports_unit_status_date" ON "damage_reports" USING btree ("unit_id","status","reported_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_reports_status_date" ON "damage_reports" USING btree ("status","reported_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_reports_creator_date" ON "damage_reports" USING btree ("created_by_user_id","reported_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uk_results_report" ON "maintenance_results" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_properties_logo_url" ON "properties" USING btree ("logo_url");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_units_property_number" ON "units" USING btree ("property_id","unit_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_units_active_resident" ON "units" USING btree ("active_resident_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uk_users_login_lower" ON "users" USING btree (lower("login_identifier"));--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "tr_properties_updated_at" BEFORE UPDATE ON "properties" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER "tr_users_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER "tr_units_updated_at" BEFORE UPDATE ON "units" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER "tr_damage_reports_updated_at" BEFORE UPDATE ON "damage_reports" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER "tr_assignments_updated_at" BEFORE UPDATE ON "assignments" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER "tr_maintenance_results_updated_at" BEFORE UPDATE ON "maintenance_results" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER "tr_cost_items_updated_at" BEFORE UPDATE ON "cost_items" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

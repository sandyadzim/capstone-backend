CREATE SEQUENCE "public"."damage_report_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
--> statement-breakpoint
DO $$
DECLARE
  max_report_number numeric;
BEGIN
  SELECT MAX(substring(report_number FROM 5)::numeric)
    INTO max_report_number
    FROM "public"."damage_reports"
    WHERE report_number ~ '^RPT-[0-9]+$'
      AND length(substring(report_number FROM 5)) <= 19;

  IF max_report_number IS NOT NULL THEN
    IF max_report_number >= 9223372036854775807 THEN
      RAISE EXCEPTION 'Existing report number exceeds sequence capacity';
    END IF;
    PERFORM setval('"public"."damage_report_number_seq"', max_report_number::bigint + 1, false);
  END IF;
END $$;

-- Preserve historical report totals when replacing quantity × unit_price.
-- Round cumulative costs in stable order; each price is the difference between
-- successive rounded sums. This assigns rounding cents without changing totals.
ALTER TABLE "cost_items" ADD COLUMN "price" numeric(23, 2);
--> statement-breakpoint
ALTER TABLE "cost_items" DISABLE TRIGGER "tr_cost_items_updated_at";
--> statement-breakpoint
WITH amounts AS (
  SELECT id,
    round(sum(quantity * unit_price) OVER (
      PARTITION BY report_id ORDER BY created_at, id ROWS UNBOUNDED PRECEDING
    ), 2) AS running_total
  FROM cost_items
), prices AS (
  SELECT id, running_total - coalesce(lag(running_total) OVER (
    PARTITION BY cost_items.report_id ORDER BY cost_items.created_at, cost_items.id
  ), 0) AS price
  FROM amounts JOIN cost_items USING (id)
)
UPDATE cost_items SET price = prices.price FROM prices WHERE cost_items.id = prices.id;
--> statement-breakpoint
ALTER TABLE "cost_items" ENABLE TRIGGER "tr_cost_items_updated_at";
--> statement-breakpoint
ALTER TABLE "cost_items" ALTER COLUMN "price" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "ck_cost_items_price_nonnegative" CHECK ("price" >= 0);
--> statement-breakpoint
ALTER TABLE "cost_items" DROP CONSTRAINT "ck_cost_items_quantity_positive";
--> statement-breakpoint
ALTER TABLE "cost_items" DROP CONSTRAINT "ck_cost_items_unit_price_nonnegative";
--> statement-breakpoint
ALTER TABLE "cost_items" DROP COLUMN "quantity";
--> statement-breakpoint
ALTER TABLE "cost_items" DROP COLUMN "unit_price";

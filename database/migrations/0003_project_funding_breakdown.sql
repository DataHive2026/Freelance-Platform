-- ============================================================================
-- DataHive — project_funding breakdown columns
-- The original 0001_init.sql project_funding table only stored the total
-- amount charged. PaymentService.confirmFunding() needed the commission
-- portion later (to write the platform_fee transaction row) and had to
-- re-derive it algebraically from the total — fragile, and wrong on the
-- first attempt (see lib/services/payments/index.ts history). Storing the
-- breakdown directly is the correct fix: it's actual data, not a value
-- reconstructed from a formula that could drift from what was actually
-- charged.
-- ============================================================================

alter table project_funding
  add column milestone_id uuid references milestones(id),
  add column base_amount numeric(12,2),
  add column commission_amount numeric(12,2),
  add column commission_pct numeric(5,2),
  add column gst_amount numeric(12,2);

comment on column project_funding.milestone_id is 'Set when this funding event was scoped to a single milestone rather than the whole remaining project budget. Null for full-project funding.';
comment on column project_funding.base_amount is 'The milestone/project amount before commission and GST — what the expert pool is drawn from.';
comment on column project_funding.commission_amount is 'Platform commission taken from base_amount, computed at the commission_pct in effect at funding time.';
comment on column project_funding.gst_amount is 'GST charged to the client on top of base_amount, computed on commission_amount.';

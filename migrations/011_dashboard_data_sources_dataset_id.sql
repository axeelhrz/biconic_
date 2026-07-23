-- Vincular cada fuente del dashboard a un dataset concreto (no solo al ETL).
-- Permite que varios datasets del mismo ETL sean independientes en dashboards.

ALTER TABLE public.dashboard_data_sources
  ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES public.dataset(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dashboard_data_sources_dataset_id
  ON public.dashboard_data_sources(dataset_id);

-- Un dashboard no puede asociar el mismo dataset dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dashboard_data_sources_dashboard_dataset
  ON public.dashboard_data_sources(dashboard_id, dataset_id)
  WHERE dataset_id IS NOT NULL;

-- Backfill: si el dashboard tiene un solo dataset bound en layout, o un único dataset del ETL.
UPDATE public.dashboard_data_sources dds
SET dataset_id = d.id
FROM public.dataset d
WHERE dds.dataset_id IS NULL
  AND d.etl_id = dds.etl_id
  AND (
    SELECT COUNT(*)::int FROM public.dataset d2 WHERE d2.etl_id = dds.etl_id
  ) = 1;

-- Names are catalog references; translations remain in data/unit_names.js.
-- Drop the text-based guard from migration 011 and remove any legacy text so
-- roster.unit_data stores only stable identity IDs.
DROP INDEX IF EXISTS public.roster_unique_character_name;

UPDATE public.roster
SET unit_data = COALESCE(unit_data, '{}'::jsonb)
  - ARRAY['given_name', 'given_name_ru', 'byname', 'byname_ru']
WHERE COALESCE(unit_data, '{}'::jsonb)
  ?| ARRAY['given_name', 'given_name_ru', 'byname', 'byname_ru'];

-- Keep the first occurrence of any duplicate IDs; login sync assigns a fresh
-- identity to rows whose IDs are cleared.
WITH ranked_names AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY chat_id,
        unit_data->>'given_name_id',
        unit_data->>'byname_id'
      ORDER BY id
    ) AS name_rank
  FROM public.roster
  WHERE COALESCE(unit_data->>'given_name_id', '') <> ''
    AND COALESCE(unit_data->>'byname_id', '') <> ''
)
UPDATE public.roster AS roster
SET unit_data = COALESCE(roster.unit_data, '{}'::jsonb)
  - CASE WHEN ranked_names.name_rank > 1
      THEN ARRAY['given_name_id', 'byname_id']
      ELSE ARRAY[]::text[]
    END
FROM ranked_names
WHERE roster.id = ranked_names.id
  AND ranked_names.name_rank > 1;

CREATE UNIQUE INDEX roster_unique_character_name_ids
  ON public.roster (
    chat_id,
    (unit_data->>'given_name_id'),
    (unit_data->>'byname_id')
  )
  WHERE COALESCE(unit_data->>'given_name_id', '') <> ''
    AND COALESCE(unit_data->>'byname_id', '') <> '';

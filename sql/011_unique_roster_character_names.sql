-- Character names are unique within one player's roster. Keep the English name
-- components as the comparison key so their Russian display forms do not affect
-- uniqueness.
WITH ranked_names AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY chat_id,
        lower(unit_data->>'given_name'),
        lower(unit_data->>'byname')
      ORDER BY id
    ) AS name_rank
  FROM public.roster
  WHERE COALESCE(unit_data->>'given_name', '') <> ''
    AND COALESCE(unit_data->>'byname', '') <> ''
)
UPDATE public.roster AS roster
SET unit_data = roster.unit_data
  - 'given_name'
  - 'given_name_ru'
  - 'byname'
  - 'byname_ru'
FROM ranked_names
WHERE roster.id = ranked_names.id
  AND ranked_names.name_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS roster_unique_character_name
  ON public.roster (
    chat_id,
    lower(unit_data->>'given_name'),
    lower(unit_data->>'byname')
  )
  WHERE COALESCE(unit_data->>'given_name', '') <> ''
    AND COALESCE(unit_data->>'byname', '') <> '';

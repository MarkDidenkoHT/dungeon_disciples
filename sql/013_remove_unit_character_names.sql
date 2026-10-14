-- Remove generated character-name metadata and its roster uniqueness indexes.
DROP INDEX IF EXISTS public.roster_unique_character_name;
DROP INDEX IF EXISTS public.roster_unique_character_name_ids;

UPDATE public.roster
SET unit_data = COALESCE(unit_data, '{}'::jsonb)
  - ARRAY[
    'sex',
    'given_name',
    'given_name_ru',
    'byname',
    'byname_ru',
    'given_name_id',
    'byname_id'
  ]::text[]
WHERE COALESCE(unit_data, '{}'::jsonb)
  ?| ARRAY[
    'sex',
    'given_name',
    'given_name_ru',
    'byname',
    'byname_ru',
    'given_name_id',
    'byname_id'
  ];

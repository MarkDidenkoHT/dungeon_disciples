-- Equipment loadouts: three sets of gear for one roster, switched as a whole.
--
-- `items.equipped_by` stays what it always was — the LIVE assignment, which
-- every reader in the game (the battle army, army power, the PvP view, the
-- castle card) already derives stats from. Nothing that reads equipment needs
-- to learn about sets.
--
-- What is new is storage for the three sets beside it. The live column is a
-- copy of whichever set is active: /items/equip writes both, and switching sets
-- copies the chosen set's column back over `equipped_by`. Set 1 is backfilled
-- from what every player is wearing now, so an existing roster keeps its gear
-- and simply finds it under Set 1.

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO col_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.items'::regclass
     AND a.attname  = 'equipped_by'
     AND a.attnum   > 0
     AND NOT a.attisdropped;

  IF col_type IS NULL THEN
    RAISE EXCEPTION 'public.items has no equipped_by column';
  END IF;

  -- One column per set, typed off `equipped_by` so a roster id stored in a set
  -- compares to a live one without a cast.
  EXECUTE format('ALTER TABLE public.items ADD COLUMN IF NOT EXISTS equipped_set_1 %s', col_type);
  EXECUTE format('ALTER TABLE public.items ADD COLUMN IF NOT EXISTS equipped_set_2 %s', col_type);
  EXECUTE format('ALTER TABLE public.items ADD COLUMN IF NOT EXISTS equipped_set_3 %s', col_type);
END $$;

-- What everyone is wearing becomes Set 1. Sets 2 and 3 start empty: a player
-- who has not built the Training Grounds that high cannot reach them yet, and
-- an empty set is a blank sheet rather than a copy to undo.
UPDATE public.items
SET equipped_set_1 = equipped_by
WHERE equipped_by IS NOT NULL
  AND equipped_set_1 IS NULL;

-- Which set is live. Global for the whole roster, so it belongs to the player
-- rather than to a unit or an item.
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS item_set smallint NOT NULL DEFAULT 1;

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_item_set_range;
ALTER TABLE public.players
  ADD CONSTRAINT players_item_set_range CHECK (item_set BETWEEN 1 AND 3);

-- Switching sets is one statement over the player's whole stash, so there is no
-- window in which half the roster wears the old set and half the new one. The
-- REST API cannot copy one column into another, which is the other reason this
-- is a function.
--
-- The cleanup first: a unit can be demolished out of the castle while a set that
-- is not live still names it. Its gear would then come back worn by a roster id
-- that no longer exists, which reads downstream as an item equipped on nothing.
-- `p_player_id` is text, compared with a cast, because the players key is not
-- the same type in every deployment of this schema and a function that names it
-- would have to be rewritten rather than applied.
CREATE OR REPLACE FUNCTION public.apply_item_set(p_player_id text, p_set smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_set NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'bad_item_set:%', p_set;
  END IF;

  UPDATE public.items i
  SET equipped_set_1 = CASE WHEN i.equipped_set_1 IS NOT NULL
                             AND NOT EXISTS (SELECT 1 FROM public.roster r WHERE r.id = i.equipped_set_1)
                            THEN NULL ELSE i.equipped_set_1 END,
      equipped_set_2 = CASE WHEN i.equipped_set_2 IS NOT NULL
                             AND NOT EXISTS (SELECT 1 FROM public.roster r WHERE r.id = i.equipped_set_2)
                            THEN NULL ELSE i.equipped_set_2 END,
      equipped_set_3 = CASE WHEN i.equipped_set_3 IS NOT NULL
                             AND NOT EXISTS (SELECT 1 FROM public.roster r WHERE r.id = i.equipped_set_3)
                            THEN NULL ELSE i.equipped_set_3 END
  WHERE i.player_id::text = p_player_id
    AND (i.equipped_set_1 IS NOT NULL OR i.equipped_set_2 IS NOT NULL OR i.equipped_set_3 IS NOT NULL);

  UPDATE public.items i
  SET equipped_by = CASE p_set
                      WHEN 1 THEN i.equipped_set_1
                      WHEN 2 THEN i.equipped_set_2
                      ELSE        i.equipped_set_3
                    END
  WHERE i.player_id::text = p_player_id;

  UPDATE public.players
  SET item_set = p_set
  WHERE id::text = p_player_id;
END $$;

-- Expedition runs: one row per embark into an expedition-mode region
-- (docs/embark-expedition-design.md). The whole run — generated map, position,
-- fog, squad, the fallen, banked loot — lives in `data`, because it is only ever
-- read and written as a whole by routes/index.js.
--
-- `version` is the optimistic lock: every write is
--   PATCH ...?id=eq.<id>&version=eq.<n>   with   version = n + 1
-- so two requests racing on the same run (a double tap, two devices) cannot both
-- apply: the second matches no row and is refused.
--
-- Finished rows are kept. They are the pilot's telemetry: outcome, steps and
-- fights per run (design doc §10.1).

CREATE TABLE IF NOT EXISTS public.expeditions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     text        NOT NULL,
  region_id   text        NOT NULL,
  level       integer     NOT NULL,
  status      text        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'ended')),
  -- How it ended: 'goal' | 'exit' | 'abandoned' | 'wiped' | 'dev_ended'.
  outcome     text,
  version     integer     NOT NULL DEFAULT 0,
  data        jsonb       NOT NULL,
  steps       integer     NOT NULL DEFAULT 0,
  fights      integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);

-- One open run per player. The insert in /expedition/start relies on this to
-- refuse a second run started from another device at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS expeditions_one_active_per_player
  ON public.expeditions (chat_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS expeditions_chat_created
  ON public.expeditions (chat_id, created_at DESC);

-- Same posture as the other game tables: the server talks to it with the
-- service key, nobody else talks to it at all.
ALTER TABLE public.expeditions ENABLE ROW LEVEL SECURITY;

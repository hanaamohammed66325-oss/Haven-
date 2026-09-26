-- Persist the planner colour-wheel pick. Before this, a note's colour was always
-- re-derived from its tag on load, so a custom colour vanished after a reload.
-- NULL = follow the tag's colour (the default); additive + nullable, so older
-- clients that never send `color` keep working unchanged.
alter table public.planner_items
  add column if not exists color text
  constraint planner_items_color_hex check (color is null or color ~ '^#[0-9a-f]{6}$');

-- Rollback:
--   alter table public.planner_items drop column if exists color;

-- Newer Supabase projects no longer grant privileges on new public tables to
-- the API roles by default. The Edge Function and bootstrap script use the
-- service role, so grant it explicitly. anon/authenticated still get nothing.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on public.participants, public.exclusions, public.wishlist_items,
     public.events, public.assignments
  to service_role;

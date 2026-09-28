-- Scheduled jobs: pg_cron fires, pg_net POSTs to the Next.js cron route.
-- Why not Vercel Cron: on Hobby it runs at most once a day with ±59 min jitter,
-- which cannot capture closing odds 15–30 min before kickoff.
--
-- Before applying, store two secrets in Supabase Vault (Dashboard → Project Settings → Vault, or SQL):
--   select vault.create_secret('https://<your-app>.vercel.app', 'site_url');
--   select vault.create_secret('<same value as CRON_SECRET>',  'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_cron_job(job text) returns bigint
language sql security definer set search_path = public as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'site_url') || '/api/cron/' || job,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.trigger_cron_job(text) from public, anon, authenticated;

-- Times are UTC.
select cron.schedule('betiq-sync-fixtures-am', '0 5 * * *',     $$select public.trigger_cron_job('sync-fixtures')$$);
select cron.schedule('betiq-sync-fixtures-pm', '30 23 * * *',   $$select public.trigger_cron_job('sync-fixtures')$$);
select cron.schedule('betiq-odds-daily',       '0 8 * * *',     $$select public.trigger_cron_job('odds-daily')$$);
select cron.schedule('betiq-odds-closing',     '*/10 * * * *',  $$select public.trigger_cron_job('odds-closing')$$);
-- 'refit' (model + predictions) is added in STEP 3.

-- Keep pg_net's response log small.
select cron.schedule('betiq-purge-net-log', '0 3 * * *', $$delete from net._http_response where created < now() - interval '3 days'$$);

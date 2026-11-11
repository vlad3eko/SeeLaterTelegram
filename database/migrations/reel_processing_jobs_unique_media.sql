-- One record per film in public.reel_processing_jobs.
--
-- The table holds the state of the current publication of a film, not a history of
-- publications: a new publication of the same film deletes the old, finished
-- record and creates a new one (see dispatchReelJob.ts). The unique key is
-- (media_id, media_type).
--
-- Execute in Supabase SQL Editor AFTER the new dispatchReelJob.ts is deployed
-- (Vercel). With the old code the unique index would make a repeated publication
-- of a published film fail.
--
-- Optional preview: films that have more than one record now.
--   select media_id, media_type, count(*) as records
--   from public.reel_processing_jobs
--   group by media_id, media_type
--   having count(*) > 1;

begin;

-- 1. Keep one record per film: an unfinished job (or a publication that can still be
--    resumed) if there is one, otherwise the newest.
with ranked as (
    select id,
           row_number() over (
               partition by media_id, media_type
               order by (
                            status in ('queued', 'processing', 'ready', 'publishing')
                            or (status = 'failed' and step in (
                                'telegram_pending', 'telegram_published',
                                'instagram_container_created', 'instagram_published'
                            ))
                        ) desc,
                        created_at desc,
                        id desc
           ) as position
    from public.reel_processing_jobs
)
delete from public.reel_processing_jobs as job
using ranked
where job.id = ranked.id
  and ranked.position > 1;

-- 2. The key itself.
create unique index if not exists reel_processing_jobs_media_unique
    on public.reel_processing_jobs (media_id, media_type);

commit;

-- Rollback of the key only (records removed in step 1 are not restored):
--   drop index if exists public.reel_processing_jobs_media_unique;

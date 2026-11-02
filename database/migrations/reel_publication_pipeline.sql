-- 1. Keep the data required to rebuild the channel keyboard after publication.
ALTER TABLE public.published_media_messages
    ADD COLUMN IF NOT EXISTS key_trailer TEXT,
    ADD COLUMN IF NOT EXISTS is_rich_type_card BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Atomically acquire the finalization lease.
-- A worker failure ('failed') is claimable for Telegram-only fallback, matching
-- the previous synchronous handler: Telegram publication continues even when
-- Reel preparation fails. Finalizer failures resume from their last completed step.
CREATE OR REPLACE FUNCTION public.claim_reel_publication_job(
    p_job_id UUID,
    p_lease_token UUID,
    p_lease_seconds INTEGER DEFAULT 240
)
RETURNS SETOF public.reel_processing_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.reel_processing_jobs AS job
    SET
        status = 'publishing',
        step = CASE
            WHEN job.status = 'ready' THEN 'telegram_pending'
            ELSE job.step
        END,
        publish_attempts = job.publish_attempts + 1,
        publishing_started_at = COALESCE(job.publishing_started_at, NOW()),
        lease_token = p_lease_token,
        lease_expires_at = NOW() + make_interval(
            secs => GREATEST(60, LEAST(COALESCE(p_lease_seconds, 240), 900))
        ),
        last_error = NULL,
        failed_at = NULL,
        updated_at = NOW()
    WHERE job.id = p_job_id
      AND (
          job.status = 'ready'
          OR (
              job.status = 'publishing'
              AND (
                  job.lease_expires_at IS NULL
                  OR job.lease_expires_at < NOW()
              )
          )
          OR (
              job.status = 'failed'
              AND job.step IN (
                  'failed',
                  'telegram_pending',
                  'telegram_published',
                  'instagram_container_created',
                  'instagram_published'
              )
          )
      )
    RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reel_publication_job(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_reel_publication_job(UUID, UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reel_publication_job(UUID, UUID, INTEGER) TO service_role;

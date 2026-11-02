-- Atomic claim for one queued Reel job, or recovery of an expired worker lease.
-- Execute in Supabase SQL Editor after creating public.reel_processing_jobs.

CREATE OR REPLACE FUNCTION public.claim_reel_processing_job(
    p_job_id UUID,
    p_lease_token UUID,
    p_lease_seconds INTEGER DEFAULT 600
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
        status = 'processing',
        step = 'downloading',
        processing_attempts = job.processing_attempts + 1,
        processing_started_at = NOW(),
        lease_token = p_lease_token,
        lease_expires_at = NOW() + make_interval(
            secs => GREATEST(60, LEAST(COALESCE(p_lease_seconds, 600), 3600))
        ),
        last_error = NULL,
        failed_at = NULL
    WHERE job.id = p_job_id
      AND (
          job.status = 'queued'
          OR (
              job.status = 'processing'
              AND (
                  job.lease_expires_at IS NULL
                  OR job.lease_expires_at < NOW()
              )
          )
      )
    RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reel_processing_job(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_reel_processing_job(UUID, UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reel_processing_job(UUID, UUID, INTEGER) TO service_role;

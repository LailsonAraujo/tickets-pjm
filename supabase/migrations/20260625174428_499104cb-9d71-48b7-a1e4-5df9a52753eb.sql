CREATE TABLE public.sso_jti_used (
  jti          uuid PRIMARY KEY,
  user_id      uuid NOT NULL,
  email        text NOT NULL,
  issued_at    timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sso_jti_used_expires ON public.sso_jti_used (expires_at);

GRANT ALL ON public.sso_jti_used TO service_role;

ALTER TABLE public.sso_jti_used ENABLE ROW LEVEL SECURITY;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'sso-jti-cleanup',
  '*/10 * * * *',
  $$ DELETE FROM public.sso_jti_used WHERE expires_at < now() - interval '5 minutes' $$
);
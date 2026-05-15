ALTER TABLE public.tickets ADD COLUMN scheduled_at TIMESTAMPTZ;
CREATE INDEX idx_tickets_scheduled_at ON public.tickets(scheduled_at) WHERE scheduled_at IS NOT NULL;
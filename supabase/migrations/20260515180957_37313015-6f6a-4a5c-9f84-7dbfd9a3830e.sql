
CREATE TABLE public.ticket_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL,
  note_id UUID,
  uploaded_by UUID,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_attachments_ticket ON public.ticket_attachments(ticket_id);
CREATE INDEX idx_ticket_attachments_note ON public.ticket_attachments(note_id);

ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attachments viewable by ticket viewers"
ON public.ticket_attachments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_attachments.ticket_id
      AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_has_provider(auth.uid(), t.provider_id))
  )
);

CREATE POLICY "Attachments insertable by ticket viewers"
ON public.ticket_attachments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = uploaded_by AND
  EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = ticket_attachments.ticket_id
      AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_has_provider(auth.uid(), t.provider_id))
  )
);

CREATE POLICY "Attachments deletable by uploader or admin"
ON public.ticket_attachments FOR DELETE
TO authenticated
USING (auth.uid() = uploaded_by OR public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ticket-attachments select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ticket-attachments' AND
  EXISTS (
    SELECT 1 FROM public.ticket_attachments a
    JOIN public.tickets t ON t.id = a.ticket_id
    WHERE a.file_path = name
      AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.user_has_provider(auth.uid(), t.provider_id))
  )
);

CREATE POLICY "ticket-attachments insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments' AND
  owner = auth.uid()
);

CREATE POLICY "ticket-attachments delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ticket-attachments' AND
  (owner = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
);

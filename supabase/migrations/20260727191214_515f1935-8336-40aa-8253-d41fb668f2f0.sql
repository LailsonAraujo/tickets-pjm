
CREATE TABLE public.transits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'transito',
  bandwidth_mbps NUMERIC NOT NULL,
  price_per_mb NUMERIC NOT NULL,
  signed_at DATE NOT NULL,
  validity_months INTEGER NOT NULL DEFAULT 12,
  expires_at DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transits TO authenticated;
GRANT ALL ON public.transits TO service_role;

ALTER TABLE public.transits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage transits" ON public.transits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_transits_updated_at
  BEFORE UPDATE ON public.transits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_transit_expiry()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.expires_at := (NEW.signed_at + (NEW.validity_months || ' months')::interval)::date;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_transit_expiry_trg
  BEFORE INSERT OR UPDATE OF signed_at, validity_months ON public.transits
  FOR EACH ROW EXECUTE FUNCTION public.set_transit_expiry();

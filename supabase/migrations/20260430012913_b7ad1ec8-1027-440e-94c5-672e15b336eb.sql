-- 1. Tabela de provedores
CREATE TABLE public.providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers viewable by authenticated"
  ON public.providers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage providers"
  ON public.providers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Tabela de vínculo user <-> provider
CREATE TABLE public.user_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_id)
);

ALTER TABLE public.user_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User providers viewable by authenticated"
  ON public.user_providers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage user providers"
  ON public.user_providers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_user_providers_user ON public.user_providers(user_id);
CREATE INDEX idx_user_providers_provider ON public.user_providers(provider_id);

-- 3. Função helper: usuário tem acesso ao provedor?
CREATE OR REPLACE FUNCTION public.user_has_provider(_user_id UUID, _provider_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_providers
    WHERE user_id = _user_id AND provider_id = _provider_id
  )
$$;

-- 4. Adiciona provider_id em tickets
ALTER TABLE public.tickets
  ADD COLUMN provider_id UUID REFERENCES public.providers(id) ON DELETE SET NULL;

CREATE INDEX idx_tickets_provider ON public.tickets(provider_id);

-- 5. Cria provedor padrão "PJM Net" e vincula tudo
INSERT INTO public.providers (name, description)
VALUES ('PJM Net', 'Provedor padrão')
ON CONFLICT (name) DO NOTHING;

-- Vincula todos os usuários existentes ao PJM Net
INSERT INTO public.user_providers (user_id, provider_id)
SELECT p.user_id, prov.id
FROM public.profiles p
CROSS JOIN public.providers prov
WHERE prov.name = 'PJM Net'
ON CONFLICT DO NOTHING;

-- Atribui todos os tickets existentes ao PJM Net
UPDATE public.tickets
SET provider_id = (SELECT id FROM public.providers WHERE name = 'PJM Net')
WHERE provider_id IS NULL;

-- 6. Atualiza RLS de tickets para filtrar por provedor
DROP POLICY IF EXISTS "Tickets viewable by authenticated" ON public.tickets;

CREATE POLICY "Tickets viewable by provider members or admin"
  ON public.tickets FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR provider_id IS NULL
    OR user_has_provider(auth.uid(), provider_id)
  );

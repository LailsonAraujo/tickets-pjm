-- 1) Atribuir tickets sem provedor a PJM Net
UPDATE public.tickets 
SET provider_id = '1f3067df-9a1c-4efa-af32-2812b08ff421'
WHERE provider_id IS NULL;

-- 2) Tornar provider_id obrigatório em tickets
ALTER TABLE public.tickets ALTER COLUMN provider_id SET NOT NULL;

-- 3) Ajustar RLS de tickets - remover brecha de provider_id IS NULL
DROP POLICY IF EXISTS "Tickets viewable by provider members or admin" ON public.tickets;
CREATE POLICY "Tickets viewable by provider members or admin"
ON public.tickets FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR user_has_provider(auth.uid(), provider_id)
);

-- 4) Adicionar provider_id em quick_links (nullable = link global visível a todos)
ALTER TABLE public.quick_links ADD COLUMN IF NOT EXISTS provider_id uuid;

-- 5) Atribuir todos os quick_links existentes a PJM Net
UPDATE public.quick_links 
SET provider_id = '1f3067df-9a1c-4efa-af32-2812b08ff421'
WHERE provider_id IS NULL;

-- 6) Atualizar RLS de quick_links - usuário só vê links do seu provedor (ou globais)
DROP POLICY IF EXISTS "Quick links viewable by authenticated" ON public.quick_links;
CREATE POLICY "Quick links viewable by provider members or admin"
ON public.quick_links FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR provider_id IS NULL
  OR user_has_provider(auth.uid(), provider_id)
);
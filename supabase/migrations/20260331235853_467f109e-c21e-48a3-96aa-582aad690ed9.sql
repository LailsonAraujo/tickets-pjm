
-- Tabela de compartilhamento de hosts
CREATE TABLE public.host_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  shared_with UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(host_id, shared_with)
);

ALTER TABLE public.host_shares ENABLE ROW LEVEL SECURITY;

-- Dono do host pode gerenciar compartilhamentos
CREATE POLICY "Owner manages shares"
  ON public.host_shares FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Quem recebeu o compartilhamento pode ver
CREATE POLICY "Shared user can view"
  ON public.host_shares FOR SELECT
  TO authenticated
  USING (auth.uid() = shared_with);

-- Admin vê tudo
CREATE POLICY "Admin views all shares"
  ON public.host_shares FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de credenciais por usuário por host
CREATE TABLE public.host_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.hosts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  username TEXT,
  encrypted_password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(host_id, user_id)
);

ALTER TABLE public.host_credentials ENABLE ROW LEVEL SECURITY;

-- Cada usuário gerencia suas próprias credenciais
CREATE POLICY "Users manage own credentials"
  ON public.host_credentials FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin vê todas credenciais
CREATE POLICY "Admin views all credentials"
  ON public.host_credentials FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Adicionar política para hosts compartilhados serem visíveis
CREATE POLICY "Shared hosts viewable"
  ON public.hosts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.host_shares
      WHERE host_shares.host_id = hosts.id
        AND host_shares.shared_with = auth.uid()
    )
  );

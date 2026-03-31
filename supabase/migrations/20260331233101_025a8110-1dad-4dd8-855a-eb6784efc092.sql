
-- Tabela de Pastas (Hierarquia)
CREATE TABLE public.host_folders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES public.host_folders(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Tabela de Hosts
CREATE TABLE public.hosts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  folder_id uuid REFERENCES public.host_folders(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text CHECK (category IN ('Roteador', 'Switch', 'OLT', 'Servidor', 'VM')),
  ip_address text NOT NULL,
  port integer DEFAULT 22,
  username text,
  encrypted_password text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE public.host_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own folders" ON public.host_folders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own hosts" ON public.hosts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admins can see all
CREATE POLICY "Admins view all folders" ON public.host_folders
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins view all hosts" ON public.hosts
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

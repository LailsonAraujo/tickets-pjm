
CREATE TABLE public.quick_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quick_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Quick links viewable by authenticated" ON public.quick_links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage quick links" ON public.quick_links
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed with existing links
INSERT INTO public.quick_links (label, url, sort_order) VALUES
  ('Grafana', 'https://grafana.pjm.net.br/', 1),
  ('Zabbix', 'https://zabbix.pjm.net.br/', 2),
  ('IXC', 'https://ixc.pjm.net.br/login.php', 3),
  ('Planilha Geral', 'https://docs.google.com/spreadsheets/d/1BQBaz8sCbS2K0ANKd-8bUjxEADBr2aOsnq6jIYR4meY/edit?gid=0#gid=0', 4),
  ('BGP.HE', 'https://bgp.he.net/', 5),
  ('BGP Tools', 'https://bgp.tools/', 6),
  ('Planilha Rede', 'https://docs.google.com/spreadsheets/u/0/d/16AXA-qef4mO4Af2X2otN21vBlUyGcPma9_ikwdSijgc/htmlview#gid=0', 7),
  ('SGI Intec', 'https://sgi.intecsolutions.com.br/', 8),
  ('PHPIPAM', 'http://45.6.36.186:65500/index.php?page=login', 9),
  ('FTP', 'http://10.225.164.5:3670/login?redirect=/files', 10),
  ('cPanel', 'https://pjm.net.br:2083/', 11),
  ('LibreNMS', 'http://nms.pjm.net.br/', 12),
  ('Routinator', 'http://[2804:3b7c:900::5a]:8323/ui/', 13),
  ('MW Soluções', 'https://sistemamw.pjm.net.br/login', 14),
  ('Diagrama', 'http://nms.pjm.net.br/plugins/Weathermap/output/backbone.html', 15);

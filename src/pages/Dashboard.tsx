import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ticket, Clock, CheckCircle, AlertTriangle, Zap, Activity, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const statusColors: Record<string, string> = {
  aberto: 'bg-info/20 text-info',
  em_andamento: 'bg-warning/20 text-warning',
  aguardando: 'bg-muted text-muted-foreground',
  concluido: 'bg-success/20 text-success',
  cancelado: 'bg-destructive/20 text-destructive',
};

const quickLinks = [
  { label: 'Grafana', url: 'https://grafana.pjm.net.br/' },
  { label: 'Zabbix', url: 'https://zabbix.pjm.net.br/' },
  { label: 'IXC', url: 'https://ixc.pjm.net.br/login.php' },
  { label: 'Planilha Geral', url: 'https://docs.google.com/spreadsheets/d/1BQBaz8sCbS2K0ANKd-8bUjxEADBr2aOsnq6jIYR4meY/edit?gid=0#gid=0' },
  { label: 'BGP.HE', url: 'https://bgp.he.net/' },
  { label: 'BGP Tools', url: 'https://bgp.tools/' },
  { label: 'Planilha Rede', url: 'https://docs.google.com/spreadsheets/u/0/d/16AXA-qef4mO4Af2X2otN21vBlUyGcPma9_ikwdSijgc/htmlview#gid=0' },
  { label: 'SGI Intec', url: 'https://sgi.intecsolutions.com.br/' },
  { label: 'PHPIPAM', url: 'http://45.6.36.186:65500/index.php?page=login' },
  { label: 'FTP', url: 'http://10.225.164.5:3670/login?redirect=/files' },
  { label: 'cPanel', url: 'https://pjm.net.br:2083/' },
  { label: 'LibreNMS', url: 'http://nms.pjm.net.br/' },
  { label: 'Routinator', url: 'http://[2804:3b7c:900::5a]:8323/ui/' },
  { label: 'MW Soluções', url: 'https://sistemamw.pjm.net.br/login' },
  { label: 'Diagrama', url: 'http://nms.pjm.net.br/plugins/Weathermap/output/backbone.html' },
];

const Dashboard = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const { data: tickets } = useQuery({
    queryKey: ['tickets-summary'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('id, status, priority, created_at');
      return data ?? [];
    },
  });

  const { data: activeNotes } = useQuery({
    queryKey: ['active-notes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_notes')
        .select('*, profiles:author_id(display_name), tickets:ticket_id(title)')
        .eq('is_active', true);
      return data ?? [];
    },
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  const open = tickets?.filter(t => t.status === 'aberto').length ?? 0;
  const inProgress = tickets?.filter(t => t.status === 'em_andamento').length ?? 0;
  const completed = tickets?.filter(t => t.status === 'concluido').length ?? 0;
  const critical = tickets?.filter(t => t.priority === 'critica' && t.status !== 'concluido').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-glow-strong">PJM Net — N2/N3</h1>
          <p className="text-muted-foreground text-sm font-mono">$ system status --overview</p>
        </div>
        <Button onClick={() => navigate('/provisioning')} className="gap-2 font-mono">
          <Zap className="h-4 w-4" />
          Provisionar ONU
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="noc-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono">Abertos</CardTitle>
            <Ticket className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-glow">{open}</div>
          </CardContent>
        </Card>
        <Card className="noc-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-glow">{inProgress}</div>
          </CardContent>
        </Card>
        <Card className="noc-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono">Concluídos</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-glow">{completed}</div>
          </CardContent>
        </Card>
        <Card className="noc-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground font-mono">Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-glow">{critical}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card className="noc-card">
        <CardHeader>
          <CardTitle className="text-lg font-mono flex items-center gap-2 text-glow">
            <ExternalLink className="h-5 w-5 text-primary" />
            Acesso Rápido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {quickLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-sm bg-muted/50 border border-border hover:border-primary hover:bg-primary/5 transition-all duration-150 group"
              >
                <span className="text-xs font-mono text-muted-foreground group-hover:text-primary transition-colors">{'>'}</span>
                <span className="text-xs font-mono truncate group-hover:text-glow">{link.label}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent tickets */}
      <Card className="noc-card">
        <CardHeader>
          <CardTitle className="text-lg font-mono flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Tickets Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tickets && tickets.length > 0 ? (
            <div className="space-y-2">
              {tickets.slice(0, 5).map(ticket => (
                <div key={ticket.id} className="flex items-center justify-between p-3 rounded-sm bg-muted/50 hover:bg-muted hover:border-primary/30 border border-transparent transition-all cursor-pointer" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                  <span className="text-sm font-mono truncate">{ticket.id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status.replace('_', ' ')}</Badge>
                    <Badge variant="outline">{ticket.priority}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8 font-mono">// nenhum ticket encontrado</p>
          )}
        </CardContent>
      </Card>

      {/* Admin: Active notes monitoring */}
      {isAdmin && (
        <Card className="noc-card">
          <CardHeader>
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary animate-pulse-glow" />
              Monitoramento em Tempo Real
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeNotes && activeNotes.length > 0 ? (
              <div className="space-y-2">
                {activeNotes.map((note: any) => (
                  <div key={note.id} className="flex items-center justify-between p-3 rounded-sm bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
                      <div>
                        <p className="text-sm font-medium font-mono">{note.profiles?.display_name ?? 'Usuário'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{note.tickets?.title ?? 'Ticket'}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-primary text-glow">ATIVO</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4 font-mono">// nenhuma nota ativa</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ticket, Clock, CheckCircle, AlertTriangle, Zap, Users, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const statusColors: Record<string, string> = {
  aberto: 'bg-info/20 text-info',
  em_andamento: 'bg-warning/20 text-warning',
  aguardando: 'bg-muted text-muted-foreground',
  concluido: 'bg-success/20 text-success',
  cancelado: 'bg-destructive/20 text-destructive',
};

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
          <h1 className="text-2xl font-bold font-mono">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Visão geral do sistema</p>
        </div>
        <Button onClick={() => navigate('/provisioning')} className="gap-2">
          <Zap className="h-4 w-4" />
          Provisionar ONU
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="noc-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Abertos</CardTitle>
            <Ticket className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{open}</div>
          </CardContent>
        </Card>
        <Card className="noc-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{inProgress}</div>
          </CardContent>
        </Card>
        <Card className="noc-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Concluídos</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{completed}</div>
          </CardContent>
        </Card>
        <Card className="noc-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Críticos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{critical}</div>
          </CardContent>
        </Card>
      </div>

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
                <div key={ticket.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors cursor-pointer" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                  <span className="text-sm font-mono truncate">{ticket.id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status.replace('_', ' ')}</Badge>
                    <Badge variant="outline">{ticket.priority}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhum ticket encontrado</p>
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
                  <div key={note.id} className="flex items-center justify-between p-3 rounded-md bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
                      <div>
                        <p className="text-sm font-medium">{note.profiles?.display_name ?? 'Usuário'}</p>
                        <p className="text-xs text-muted-foreground">{note.tickets?.title ?? 'Ticket'}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-primary">ATIVO</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4">Nenhuma nota ativa no momento</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;

import { useState, useMemo } from 'react';
import { subDays, startOfDay } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Ticket, Clock, CheckCircle, AlertTriangle, Zap, Activity, ExternalLink, Pencil, Plus, Trash2, Save, Trophy, Timer } from 'lucide-react';
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingLinks, setEditingLinks] = useState(false);
  const [newLink, setNewLink] = useState({ label: '', url: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', url: '' });

  const { data: tickets } = useQuery({
    queryKey: ['tickets-summary'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('id, status, priority, created_at');
      return data ?? [];
    },
  });

  const { data: quickLinks } = useQuery({
    queryKey: ['quick-links'],
    queryFn: async () => {
      const { data } = await supabase.from('quick_links').select('*').order('sort_order');
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

  const { data: profiles } = useQuery({
    queryKey: ['profiles-list'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, display_name').eq('is_active', true);
      return data ?? [];
    },
  });

  const { data: allNotes } = useQuery({
    queryKey: ['all-notes-ranking'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_notes').select('author_id, time_spent_seconds');
      return data ?? [];
    },
  });

  const { data: closedTickets } = useQuery({
    queryKey: ['closed-tickets-ranking'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('assigned_to').eq('status', 'concluido');
      return data ?? [];
    },
  });

  const addLink = useMutation({
    mutationFn: async () => {
      const maxOrder = quickLinks?.length ? Math.max(...quickLinks.map((l: any) => l.sort_order)) + 1 : 1;
      const { error } = await supabase.from('quick_links').insert({ label: newLink.label, url: newLink.url, sort_order: maxOrder });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-links'] });
      setNewLink({ label: '', url: '' });
      toast({ title: 'Link adicionado!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const updateLink = useMutation({
    mutationFn: async ({ id, label, url }: { id: string; label: string; url: string }) => {
      const { error } = await supabase.from('quick_links').update({ label, url }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-links'] });
      setEditingId(null);
      toast({ title: 'Link atualizado!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quick_links').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-links'] });
      toast({ title: 'Link removido!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const getDisplayName = (userId: string | null) => {
    if (!userId) return 'Desconhecido';
    return profiles?.find(p => p.user_id === userId)?.display_name ?? 'Desconhecido';
  };

  const formatHours = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  // Ranking: hours by user
  const hoursRanking = (() => {
    if (!allNotes) return [];
    const map = new Map<string, number>();
    allNotes.forEach(n => {
      map.set(n.author_id, (map.get(n.author_id) ?? 0) + (n.time_spent_seconds ?? 0));
    });
    return Array.from(map.entries())
      .map(([userId, seconds]) => ({ userId, seconds }))
      .sort((a, b) => b.seconds - a.seconds);
  })();

  // Ranking: closed tickets by user
  const closedRanking = (() => {
    if (!closedTickets) return [];
    const map = new Map<string, number>();
    closedTickets.forEach(t => {
      if (t.assigned_to) map.set(t.assigned_to, (map.get(t.assigned_to) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  })();

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
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-mono flex items-center gap-2 text-glow">
              <ExternalLink className="h-5 w-5 text-primary" />
              Acesso Rápido
            </CardTitle>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setEditingLinks(!editingLinks)} className="gap-1 font-mono text-xs">
                <Pencil className="h-3 w-3" />
                {editingLinks ? 'Fechar' : 'Gerenciar'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isAdmin && editingLinks && (
            <div className="mb-4 space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-mono">Nome</Label>
                  <Input value={newLink.label} onChange={e => setNewLink({ ...newLink, label: e.target.value })} placeholder="Nome do link" className="h-8 text-xs" />
                </div>
                <div className="flex-[2] space-y-1">
                  <Label className="text-xs font-mono">URL</Label>
                  <Input value={newLink.url} onChange={e => setNewLink({ ...newLink, url: e.target.value })} placeholder="https://..." className="h-8 text-xs" />
                </div>
                <Button size="sm" onClick={() => addLink.mutate()} disabled={!newLink.label || !newLink.url} className="h-8 gap-1">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
              <div className="space-y-1">
                {quickLinks?.map((link: any) => (
                  <div key={link.id} className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-border">
                    {editingId === link.id ? (
                      <>
                        <Input value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} className="h-7 text-xs flex-1" />
                        <Input value={editForm.url} onChange={e => setEditForm({ ...editForm, url: e.target.value })} className="h-7 text-xs flex-[2]" />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateLink.mutate({ id: link.id, ...editForm })}>
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>✕</Button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-mono flex-1 truncate">{link.label}</span>
                        <span className="text-xs text-muted-foreground flex-[2] truncate">{link.url}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(link.id); setEditForm({ label: link.label, url: link.url }); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteLink.mutate(link.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {quickLinks?.map((link: any) => (
              <a
                key={link.id}
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

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="noc-card">
          <CardHeader>
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" />
              Ranking — Horas Trabalhadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hoursRanking.length > 0 ? (
              <div className="space-y-2">
                {hoursRanking.map((entry, i) => (
                  <div key={entry.userId} className="flex items-center justify-between p-3 rounded-sm bg-muted/50 border border-border">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold font-mono ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                        #{i + 1}
                      </span>
                      <span className="text-sm font-mono">{getDisplayName(entry.userId)}</span>
                    </div>
                    <Badge variant="outline" className="font-mono">{formatHours(entry.seconds)}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4 font-mono">// sem dados</p>
            )}
          </CardContent>
        </Card>

        <Card className="noc-card">
          <CardHeader>
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Ranking — Tickets Fechados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {closedRanking.length > 0 ? (
              <div className="space-y-2">
                {closedRanking.map((entry, i) => (
                  <div key={entry.userId} className="flex items-center justify-between p-3 rounded-sm bg-muted/50 border border-border">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold font-mono ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                        #{i + 1}
                      </span>
                      <span className="text-sm font-mono">{getDisplayName(entry.userId)}</span>
                    </div>
                    <Badge variant="outline" className="font-mono">{entry.count} ticket{entry.count !== 1 ? 's' : ''}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-4 font-mono">// sem dados</p>
            )}
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

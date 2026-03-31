import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, User } from 'lucide-react';
import { Navigate } from 'react-router-dom';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return <span className="font-mono text-primary text-glow text-lg">{formatTime(elapsed)}</span>;
}

const Monitor = () => {
  const { isAdmin } = useAuth();

  if (!isAdmin) return <Navigate to="/" replace />;

  const { data: activeNotes } = useQuery({
    queryKey: ['monitor-active-notes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_notes')
        .select('*, profiles:author_id(display_name), tickets:ticket_id(id, title, category, priority)')
        .eq('is_active', true)
        .order('started_at', { ascending: true });
      return data ?? [];
    },
    refetchInterval: 5000,
  });

  const { data: recentNotes } = useQuery({
    queryKey: ['monitor-recent-notes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_notes')
        .select('*, profiles:author_id(display_name), tickets:ticket_id(id, title)')
        .eq('is_active', false)
        .order('updated_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const { data: profiles } = useQuery({
    queryKey: ['monitor-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, display_name').eq('is_active', true);
      return data ?? [];
    },
  });

  // Map active notes by user
  const activeByUser = new Map<string, any[]>();
  activeNotes?.forEach((note: any) => {
    const userId = note.author_id;
    if (!activeByUser.has(userId)) activeByUser.set(userId, []);
    activeByUser.get(userId)!.push(note);
  });

  const activeUserIds = new Set(activeByUser.keys());
  const idleUsers = profiles?.filter(p => !activeUserIds.has(p.user_id)) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono flex items-center gap-2 text-glow-strong">
          <Activity className="h-6 w-6 text-primary animate-pulse-glow" />
          Monitor
        </h1>
        <p className="text-muted-foreground text-sm font-mono">$ watch --interval=5 collaborators --status</p>
      </div>

      {/* Active collaborators */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
          Colaboradores Ativos ({activeByUser.size})
        </h2>

        {activeByUser.size > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from(activeByUser.entries()).map(([userId, notes]) => (
              <Card key={userId} className="noc-card border-primary/30 noc-glow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-mono">{notes[0]?.profiles?.display_name ?? 'Usuário'}</CardTitle>
                        <p className="text-xs text-primary font-mono">● ONLINE</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-mono">
                      {notes.length} nota{notes.length > 1 ? 's' : ''} ativa{notes.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {notes.map((note: any) => (
                    <div key={note.id} className="p-3 rounded bg-muted/30 border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate flex-1">{note.tickets?.title ?? 'Ticket'}</p>
                        <div className="flex items-center gap-1.5 ml-2">
                          <Clock className="h-3 w-3 text-primary" />
                          {note.started_at ? (
                            <ElapsedTimer startedAt={note.started_at} />
                          ) : (
                            <span className="font-mono text-sm text-muted-foreground">{formatTime(note.time_spent_seconds)}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{note.description}</p>
                      <div className="flex gap-2">
                        {note.tickets?.category && <Badge variant="outline" className="text-[10px]">{note.tickets.category}</Badge>}
                        {note.tickets?.priority && <Badge variant="outline" className="text-[10px]">{note.tickets.priority}</Badge>}
                        <span className="text-[10px] text-muted-foreground font-mono">#{note.tickets?.id?.slice(0, 8)}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="noc-card">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground font-mono text-sm">// nenhum colaborador ativo no momento</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Idle users */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
          Colaboradores Inativos ({idleUsers.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {idleUsers.map(u => (
            <div key={u.user_id} className="flex items-center gap-2 px-3 py-2 rounded bg-muted/30 border border-border">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                <span className="text-[10px] font-mono font-bold text-muted-foreground">{(u.display_name ?? 'U').charAt(0).toUpperCase()}</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">{u.display_name}</span>
            </div>
          ))}
          {idleUsers.length === 0 && <p className="text-xs text-muted-foreground font-mono">Todos os colaboradores estão ativos</p>}
        </div>
      </div>

      {/* Recent completed notes */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold font-mono">Notas Recentes Concluídas</h2>
        <Card className="noc-card">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentNotes?.map((note: any) => (
                <div key={note.id} className="p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-mono font-bold">{(note.profiles?.display_name ?? 'U').charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{note.profiles?.display_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{note.tickets?.title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">{formatTime(note.time_spent_seconds)}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(note.updated_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
              ))}
              {recentNotes?.length === 0 && (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground text-sm font-mono">// nenhuma nota recente</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Monitor;

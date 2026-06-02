import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, Inbox, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  aberto: 'bg-info/20 text-info border-info/30',
  em_andamento: 'bg-warning/20 text-warning border-warning/30',
  aguardando: 'bg-muted text-muted-foreground border-border',
};

const priorityColors: Record<string, string> = {
  baixa: 'bg-muted text-muted-foreground',
  media: 'bg-info/20 text-info',
  alta: 'bg-warning/20 text-warning',
  critica: 'bg-destructive/20 text-destructive',
};

const statusLabel: Record<string, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
};

export function MyTicketsPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');

  const { data: tickets } = useQuery({
    queryKey: ['my-active-tickets', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('tickets')
        .select('id, title, status, priority, created_at, updated_at')
        .eq('assigned_to', user.id)
        .in('status', ['aberto', 'em_andamento', 'aguardando'])
        .order('updated_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  const filtered = (tickets ?? []).filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.id.includes(search)
  );

  const currentId = location.pathname.startsWith('/tickets/') ? location.pathname.split('/')[2] : null;

  if (collapsed) {
    return (
      <div className="w-10 border-r border-border bg-sidebar flex flex-col items-center py-3 gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCollapsed(false)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="flex flex-col items-center gap-1 mt-2">
          <Inbox className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-mono text-muted-foreground">{filtered.length}</span>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-72 border-r border-border bg-sidebar flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-primary" />
          <span className="text-xs font-mono font-bold text-glow">MEUS TICKETS</span>
          <Badge variant="outline" className="h-5 text-[10px] font-mono">{filtered.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(true)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="h-7 pl-7 text-xs font-mono"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground font-mono">
            Nenhum ticket atribuído
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map(t => {
              const active = currentId === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => navigate(`/tickets/${t.id}`)}
                    className={cn(
                      'w-full text-left px-3 py-2 hover:bg-sidebar-accent transition-colors',
                      active && 'bg-sidebar-accent border-l-2 border-primary'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-xs font-medium truncate flex-1">{t.title}</p>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {new Date(t.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground truncate mb-1">
                      #{t.id.slice(0, 8)}
                    </p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="outline" className={cn('h-4 text-[9px] px-1 font-mono', statusColors[t.status])}>
                        {statusLabel[t.status]}
                      </Badge>
                      <Badge variant="outline" className={cn('h-4 text-[9px] px-1 font-mono', priorityColors[t.priority])}>
                        {t.priority}
                      </Badge>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </aside>
  );
}

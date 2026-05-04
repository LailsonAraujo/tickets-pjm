import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Ticket as TicketIcon, Filter, CalendarIcon, X } from 'lucide-react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Enums } from '@/integrations/supabase/types';

const statusColors: Record<string, string> = {
  aberto: 'bg-info/20 text-info',
  em_andamento: 'bg-warning/20 text-warning',
  aguardando: 'bg-muted text-muted-foreground',
  concluido: 'bg-success/20 text-success',
  cancelado: 'bg-destructive/20 text-destructive',
};

const priorityColors: Record<string, string> = {
  baixa: 'bg-muted text-muted-foreground',
  media: 'bg-info/20 text-info',
  alta: 'bg-warning/20 text-warning',
  critica: 'bg-destructive/20 text-destructive',
};

const statusLabels: Record<string, string> = {
  aberto: 'Abertos',
  em_andamento: 'Em Andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluídos',
  cancelado: 'Cancelados',
};

const priorityLabels: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

const categoryLabels: Record<string, string> = {
  provisionamento: 'Provisionamento',
  manutencao: 'Manutenção',
  incidente: 'Incidente',
  solicitacao: 'Solicitação',
  outros: 'Outros',
};

const Tickets = () => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Search & filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [techFilter, setTechFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Enums<'ticket_priority'>>('media');
  const [category, setCategory] = useState<Enums<'ticket_category'>>('outros');
  const [assignedTo, setAssignedTo] = useState('');
  const [providerId, setProviderId] = useState<string>('');

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, display_name').eq('is_active', true);
      return data ?? [];
    },
  });

  // Todos os vínculos user<->provider (visíveis a authenticated)
  const { data: allUserProviders } = useQuery({
    queryKey: ['all-user-providers'],
    queryFn: async () => {
      const { data } = await supabase.from('user_providers').select('user_id, provider_id');
      return data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data } = await supabase.from('providers').select('id, name').order('name');
      return data ?? [];
    },
  });

  // Provedores aos quais o usuário atual pertence (para escolher no Novo Ticket)
  const { data: myProviders } = useQuery({
    queryKey: ['my-providers', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('user_providers').select('provider_id').eq('user_id', user.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const availableProviders = useMemo(() => {
    if (!providers) return [];
    if (isAdmin) return providers;
    const ids = new Set(myProviders?.map(m => m.provider_id) ?? []);
    return providers.filter(p => ids.has(p.id));
  }, [providers, myProviders, isAdmin]);

  // Usuários visíveis no seletor "Responsável" e no filtro "Técnico":
  // Admin vê todos; demais veem apenas usuários que pertencem a algum provedor em comum.
  const visibleUsers = useMemo(() => {
    if (!users) return [];
    if (isAdmin) return users;
    const myIds = new Set(myProviders?.map(m => m.provider_id) ?? []);
    if (myIds.size === 0) return [];
    const allowed = new Set(
      (allUserProviders ?? [])
        .filter(up => myIds.has(up.provider_id))
        .map(up => up.user_id)
    );
    return users.filter(u => allowed.has(u.user_id));
  }, [users, allUserProviders, myProviders, isAdmin]);

  // Auto-seleciona se houver apenas 1 provedor disponível
  useEffect(() => {
    if (dialogOpen && !providerId && availableProviders.length === 1) {
      setProviderId(availableProviders[0].id);
    }
  }, [dialogOpen, providerId, availableProviders]);

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!providerId) throw new Error('Selecione um provedor');
      const { data, error } = await supabase.from('tickets').insert({
        title, description, priority, category,
        assigned_to: assignedTo || null,
        created_by: user!.id,
        provider_id: providerId,
      }).select('id').single();
      if (error) throw error;

      const creatorProfile = users?.find(u => u.user_id === user!.id);
      const assignedProfile = assignedTo ? users?.find(u => u.user_id === assignedTo) : null;

      supabase.functions.invoke('telegram-notify', {
        body: {
          ticket_title: title, ticket_id: data.id,
          assigned_to_name: assignedProfile?.display_name ?? null,
          created_by_name: creatorProfile?.display_name ?? user!.email ?? 'Desconhecido',
          priority, category,
        },
      }).catch(err => console.error('Telegram notify error:', err));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast({ title: 'Ticket criado com sucesso!' });
      setDialogOpen(false);
      setTitle(''); setDescription(''); setPriority('media'); setCategory('outros'); setAssignedTo(''); setProviderId('');
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (priorityFilter !== 'all') count++;
    if (categoryFilter !== 'all') count++;
    if (techFilter !== 'all') count++;
    if (providerFilter !== 'all') count++;
    if (dateFrom) count++;
    if (dateTo) count++;
    return count;
  }, [statusFilter, priorityFilter, categoryFilter, techFilter, providerFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setCategoryFilter('all');
    setTechFilter('all');
    setProviderFilter('all');
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const filtered = useMemo(() => {
    return tickets?.filter(t => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.id.includes(search)) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (techFilter !== 'all' && t.assigned_to !== techFilter) return false;
      if (providerFilter !== 'all' && t.provider_id !== providerFilter) return false;
      if (dateFrom && new Date(t.created_at) < startOfDay(dateFrom)) return false;
      if (dateTo && new Date(t.created_at) > endOfDay(dateTo)) return false;
      return true;
    });
  }, [tickets, search, statusFilter, priorityFilter, categoryFilter, techFilter, providerFilter, dateFrom, dateTo]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono">Tickets</h1>
          <p className="text-muted-foreground text-sm">Gerenciamento de chamados</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Ticket</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-mono">Criar Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createTicket.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do ticket" required />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o problema..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select value={priority} onValueChange={v => setPriority(v as Enums<'ticket_priority'>)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="critica">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={v => setCategory(v as Enums<'ticket_category'>)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provisionamento">Provisionamento</SelectItem>
                      <SelectItem value="manutencao">Manutenção</SelectItem>
                      <SelectItem value="incidente">Incidente</SelectItem>
                      <SelectItem value="solicitacao">Solicitação</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Provedor *</Label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar provedor" /></SelectTrigger>
                  <SelectContent>
                    {availableProviders.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableProviders.length === 0 && (
                  <p className="text-xs text-destructive">Você não está vinculado a nenhum provedor. Contate um admin.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                  <SelectContent>
                    {visibleUsers?.map(u => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createTicket.isPending}>
                {createTicket.isPending ? 'Criando...' : 'Criar Ticket'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search + Filter toggle */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tickets..." className="pl-9" />
        </div>
      </div>

      {/* Filters row */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Prioridade</Label>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(priorityLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Categoria</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {Object.entries(categoryLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Técnico</Label>
          <Select value={techFilter} onValueChange={setTechFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {visibleUsers?.map(u => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Provedor</Label>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {availableProviders.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[130px] h-9 text-xs justify-start", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[130px] h-9 text-xs justify-start", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1 h-3 w-3" />
                {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs gap-1 text-muted-foreground">
            <X className="h-3 w-3" /> Limpar ({activeFilterCount})
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered && filtered.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} ticket(s) encontrado(s)</p>
          {filtered.map((ticket: any) => {
            const creator = users?.find(u => u.user_id === ticket.created_by);
            const assignee = users?.find(u => u.user_id === ticket.assigned_to);
            return (
              <Card key={ticket.id} className="noc-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/tickets/${ticket.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <TicketIcon className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{ticket.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          #{ticket.id.slice(0, 8)} • {creator?.display_name ?? 'Desconhecido'}
                          {assignee && <span> → {assignee.display_name}</span>}
                          {' • '}{format(new Date(ticket.created_at), 'dd/MM/yy HH:mm')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status.replace('_', ' ')}</Badge>
                      <Badge variant="outline" className={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
                      <Badge variant="outline">{ticket.category}</Badge>
                      {ticket.provider_id && (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                          {providers?.find(p => p.id === ticket.provider_id)?.name ?? '—'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <TicketIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhum ticket encontrado</p>
        </div>
      )}
    </div>
  );
};

export default Tickets;

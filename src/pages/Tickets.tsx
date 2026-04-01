import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Ticket as TicketIcon } from 'lucide-react';
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

const Tickets = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Enums<'ticket_priority'>>('media');
  const [category, setCategory] = useState<Enums<'ticket_category'>>('outros');
  const [assignedTo, setAssignedTo] = useState('');

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets', statusFilter],
    queryFn: async () => {
      let query = supabase.from('tickets').select('*').order('created_at', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter as Enums<'ticket_status'>);
      const { data } = await query;
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

  const createTicket = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('tickets').insert({
        title,
        description,
        priority,
        category,
        assigned_to: assignedTo || null,
        created_by: user!.id,
      }).select('id').single();
      if (error) throw error;

      // Get display names for the notification
      const creatorProfile = users?.find(u => u.user_id === user!.id);
      const assignedProfile = assignedTo ? users?.find(u => u.user_id === assignedTo) : null;

      // Send Telegram notification (fire-and-forget)
      supabase.functions.invoke('telegram-notify', {
        body: {
          ticket_title: title,
          ticket_id: data.id,
          assigned_to_name: assignedProfile?.display_name ?? null,
          created_by_name: creatorProfile?.display_name ?? user!.email ?? 'Desconhecido',
          priority,
          category,
        },
      }).catch(err => console.error('Telegram notify error:', err));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast({ title: 'Ticket criado com sucesso!' });
      setDialogOpen(false);
      setTitle('');
      setDescription('');
      setPriority('media');
      setCategory('outros');
      setAssignedTo('');
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const filtered = tickets?.filter(t => 
    (t as any).title?.toLowerCase().includes(search.toLowerCase()) ||
    t.id.includes(search)
  );

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
                <Label>Responsável</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                  <SelectContent>
                    {users?.map(u => (
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

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tickets..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="aberto">Abertos</SelectItem>
            <SelectItem value="em_andamento">Em Andamento</SelectItem>
            <SelectItem value="aguardando">Aguardando</SelectItem>
            <SelectItem value="concluido">Concluídos</SelectItem>
            <SelectItem value="cancelado">Cancelados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered && filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((ticket: any) => (
            <Card key={ticket.id} className="noc-card cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/tickets/${ticket.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <TicketIcon className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground font-mono">#{ticket.id.slice(0, 8)} • {ticket.profiles?.display_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={statusColors[ticket.status]}>{ticket.status.replace('_', ' ')}</Badge>
                    <Badge variant="outline" className={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
                    <Badge variant="outline">{ticket.category}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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

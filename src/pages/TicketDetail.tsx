import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Play, Pause, Clock, Plus, Save, Trash2, Pencil, X } from 'lucide-react';
import type { Enums } from '@/integrations/supabase/types';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const TicketDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newNote, setNewNote] = useState({ description: '', what_was_done: '', rollback_plan: '', time_spent_seconds: 0 });
  const [showNoteForm, setShowNoteForm] = useState(false);
  const timerStorageKey = user && id ? `ticket-timer:${user.id}:${id}` : null;
  const loadTimer = () => {
    if (!timerStorageKey) return { accumulated: 0, startedAt: null as number | null };
    try {
      const raw = localStorage.getItem(timerStorageKey);
      if (!raw) return { accumulated: 0, startedAt: null };
      const parsed = JSON.parse(raw);
      return { accumulated: parsed.accumulated ?? 0, startedAt: parsed.startedAt ?? null };
    } catch {
      return { accumulated: 0, startedAt: null };
    }
  };
  const [timerState, setTimerState] = useState<{ accumulated: number; startedAt: number | null }>({ accumulated: 0, startedAt: null });
  const [timerTick, setTimerTick] = useState(0);
  const timerActive = timerState.startedAt !== null;
  const timerSeconds = timerState.accumulated + (timerState.startedAt ? Math.floor((Date.now() - timerState.startedAt) / 1000) : 0);
  void timerTick;
  const [deleteTicketOpen, setDeleteTicketOpen] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState({ description: '', what_was_done: '', rollback_plan: '' });

  // Fetch users for display name lookup
  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, display_name').eq('is_active', true);
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

  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  const { data: notes } = useQuery({
    queryKey: ['ticket-notes', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('ticket_notes').select('*').eq('ticket_id', id!).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id && !!user,
  });

  // Load persisted timer when ticket/user changes
  useEffect(() => {
    setTimerState(loadTimer());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerStorageKey]);

  // Tick every second only when running, to refresh display
  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  const persistTimer = (next: { accumulated: number; startedAt: number | null }) => {
    setTimerState(next);
    if (!timerStorageKey) return;
    if (next.accumulated === 0 && next.startedAt === null) {
      localStorage.removeItem(timerStorageKey);
    } else {
      localStorage.setItem(timerStorageKey, JSON.stringify(next));
    }
  };

  const toggleTimer = () => {
    if (timerState.startedAt) {
      // pause: fold elapsed into accumulated
      const elapsed = Math.floor((Date.now() - timerState.startedAt) / 1000);
      persistTimer({ accumulated: timerState.accumulated + elapsed, startedAt: null });
    } else {
      persistTimer({ accumulated: timerState.accumulated, startedAt: Date.now() });
    }
  };

  const resetTimer = () => persistTimer({ accumulated: 0, startedAt: null });

  const getDisplayName = (userId: string | null) => {
    if (!userId) return 'Não atribuído';
    return users?.find(u => u.user_id === userId)?.display_name ?? 'Desconhecido';
  };

  const canEditTicket = isAdmin || ticket?.assigned_to === user?.id || ticket?.created_by === user?.id;

  const updateStatus = useMutation({
    mutationFn: async (status: Enums<'ticket_status'>) => {
      const oldStatus = ticket?.status;
      const { error } = await supabase.from('tickets').update({ status, closed_at: status === 'concluido' ? new Date().toISOString() : null }).eq('id', id!);
      if (error) throw error;
      if (ticket && oldStatus !== status) {
        supabase.functions.invoke('telegram-notify-status', {
          body: {
            ticket_title: ticket.title,
            ticket_id: ticket.id,
            old_status: oldStatus,
            new_status: status,
            changed_by_name: getDisplayName(user?.id ?? null),
            assigned_to_name: ticket.assigned_to ? getDisplayName(ticket.assigned_to) : null,
          },
        }).catch((err) => console.error('Telegram notify failed:', err));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      toast({ title: 'Status atualizado!' });
    },
  });

  const updateAssignee = useMutation({
    mutationFn: async (assignedTo: string | null) => {
      const { error } = await supabase.from('tickets').update({ assigned_to: assignedTo }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      toast({ title: 'Responsável atualizado!' });
    },
  });

  const updateProvider = useMutation({
    mutationFn: async (providerId: string | null) => {
      const { error } = await supabase.from('tickets').update({ provider_id: providerId }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      toast({ title: 'Provedor atualizado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!newNote.description.trim() || !newNote.what_was_done?.trim()) {
        throw new Error('Descrição e "O que foi feito" são obrigatórios');
      }
      const { error } = await supabase.from('ticket_notes').insert({
        ticket_id: id!,
        author_id: user!.id,
        description: newNote.description,
        what_was_done: newNote.what_was_done,
        rollback_plan: newNote.rollback_plan || null,
        time_spent_seconds: timerSeconds || newNote.time_spent_seconds,
      });
      if (error) throw error;

      // Auto-assign only if no one is assigned
      if (ticket && !ticket.assigned_to) {
        await supabase.from('tickets').update({ assigned_to: user!.id }).eq('id', id!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-notes', id] });
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      setNewNote({ description: '', what_was_done: '', rollback_plan: '', time_spent_seconds: 0 });
      setShowNoteForm(false);
      resetTimer();
      toast({ title: 'Nota adicionada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteTicket = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tickets').delete().eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Ticket excluído!' });
      navigate('/tickets');
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from('ticket_notes').delete().eq('id', noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-notes', id] });
      setDeleteNoteId(null);
      toast({ title: 'Nota excluída!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const updateNote = useMutation({
    mutationFn: async () => {
      if (!editingNoteId) return;
      if (!editNote.description.trim() || !editNote.what_was_done.trim()) {
        throw new Error('Descrição e "O que foi feito" são obrigatórios');
      }
      const { error } = await supabase.from('ticket_notes').update({
        description: editNote.description,
        what_was_done: editNote.what_was_done,
        rollback_plan: editNote.rollback_plan || null,
        edited_at: new Date().toISOString(),
      }).eq('id', editingNoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-notes', id] });
      setEditingNoteId(null);
      toast({ title: 'Nota atualizada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  if (ticketLoading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;
  if (!ticket) return <div className="text-center py-12 text-muted-foreground">Ticket não encontrado</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate('/tickets')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        {isAdmin && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteTicketOpen(true)} className="gap-2">
            <Trash2 className="h-4 w-4" /> Excluir Ticket
          </Button>
        )}
      </div>

      <Card className="noc-card">
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-xl font-mono">{ticket.title}</CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">#{ticket.id.slice(0, 8)} • Criado por {getDisplayName(ticket.created_by)}</p>
            </div>
            <div className="flex items-center gap-2">
              {canEditTicket ? (
                <Select value={ticket.status} onValueChange={v => updateStatus.mutate(v as Enums<'ticket_status'>)}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Aberto</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="aguardando">Aguardando</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="font-mono">{ticket.status.replace('_', ' ')}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {ticket.description && <p className="text-sm whitespace-pre-wrap break-words">{ticket.description}</p>}
          <div className="flex gap-2 flex-wrap items-center">
            <Badge variant="outline">{ticket.priority}</Badge>
            <Badge variant="outline">{ticket.category}</Badge>
            {canEditTicket ? (
              <Select value={ticket.assigned_to || 'none'} onValueChange={v => updateAssignee.mutate(v === 'none' ? null : v)}>
                <SelectTrigger className="w-[200px] h-7 text-xs">
                  <SelectValue placeholder="Atribuir técnico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não atribuído</SelectItem>
                  {users?.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="outline">Resp: {getDisplayName(ticket.assigned_to)}</Badge>
            )}
            {isAdmin ? (
              <Select value={ticket.provider_id || 'none'} onValueChange={v => updateProvider.mutate(v === 'none' ? null : v)}>
                <SelectTrigger className="w-[180px] h-7 text-xs">
                  <SelectValue placeholder="Provedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem provedor</SelectItem>
                  {providers?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              ticket.provider_id && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  {providers?.find(p => p.id === ticket.provider_id)?.name ?? '—'}
                </Badge>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-mono">Notas</h2>
        <Button onClick={() => setShowNoteForm(true)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" /> Nova Nota
        </Button>
      </div>

      {showNoteForm && (
        <Card className="noc-card border-primary/30">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-sm font-medium">Nova Nota</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={toggleTimer} className="gap-1 font-mono">
                  {timerActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {formatTime(timerSeconds)}
                </Button>
              </div>
            </div>
            {!ticket.assigned_to && (
              <div className="p-2 rounded bg-info/10 border border-info/20">
                <p className="text-xs font-mono text-info">ℹ Este ticket não possui responsável. Ao salvar a nota, ele será atribuído a você automaticamente.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Textarea value={newNote.description} onChange={e => setNewNote({ ...newNote, description: e.target.value })} placeholder="Descreva a atividade..." />
            </div>
            <div className="space-y-2">
              <Label>O que foi aplicado *</Label>
              <Textarea value={newNote.what_was_done} onChange={e => setNewNote({ ...newNote, what_was_done: e.target.value })} placeholder="Descreva o que foi feito..." />
            </div>
            <div className="space-y-2">
              <Label>Plano de Rollback (opcional)</Label>
              <Textarea value={newNote.rollback_plan} onChange={e => setNewNote({ ...newNote, rollback_plan: e.target.value })} placeholder="Plano de reversão..." />
            </div>
            {!timerActive && timerSeconds === 0 && (
              <div className="space-y-2">
                <Label>Tempo manual (minutos)</Label>
                <Input type="number" min={0} value={Math.round(newNote.time_spent_seconds / 60)} onChange={e => setNewNote({ ...newNote, time_spent_seconds: parseInt(e.target.value || '0') * 60 })} />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => addNote.mutate()} disabled={addNote.isPending} className="gap-2">
                <Save className="h-4 w-4" /> Salvar Nota
              </Button>
              <Button variant="outline" onClick={() => { setShowNoteForm(false); setTimerActive(false); setTimerSeconds(0); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {notes?.map((note: any) => {
          const canEditNote = isAdmin || note.author_id === user?.id;
          const isEditing = editingNoteId === note.id;
          return (
          <Card key={note.id} className="noc-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{getDisplayName(note.author_id)}</p>
                  {note.edited_at && (
                    <Badge variant="outline" className="text-[10px] font-mono h-5 px-1.5 border-warning/40 text-warning">
                      editada
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">{formatTime(note.time_spent_seconds)}</span>
                  <span>•</span>
                  <span>{new Date(note.created_at).toLocaleString('pt-BR')}</span>
                  {canEditNote && !isEditing && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                      setEditingNoteId(note.id);
                      setEditNote({
                        description: note.description ?? '',
                        what_was_done: note.what_was_done ?? '',
                        rollback_plan: note.rollback_plan ?? '',
                      });
                    }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  {isAdmin && !isEditing && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleteNoteId(note.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              {isEditing ? (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Descrição *</Label>
                    <Textarea value={editNote.description} onChange={e => setEditNote({ ...editNote, description: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">O que foi aplicado *</Label>
                    <Textarea value={editNote.what_was_done} onChange={e => setEditNote({ ...editNote, what_was_done: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Plano de Rollback</Label>
                    <Textarea value={editNote.rollback_plan} onChange={e => setEditNote({ ...editNote, rollback_plan: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateNote.mutate()} disabled={updateNote.isPending} className="gap-2">
                      <Save className="h-3 w-3" /> Salvar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingNoteId(null)} className="gap-2">
                      <X className="h-3 w-3" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap break-words">{note.description}</p>
                  {note.what_was_done && (
                    <div className="p-2 rounded bg-muted/50">
                      <p className="text-xs text-muted-foreground font-mono mb-1">O QUE FOI APLICADO:</p>
                      <p className="text-sm whitespace-pre-wrap break-words">{note.what_was_done}</p>
                    </div>
                  )}
                  {note.rollback_plan && (
                    <div className="p-2 rounded bg-warning/10">
                      <p className="text-xs text-warning font-mono mb-1">ROLLBACK:</p>
                      <p className="text-sm whitespace-pre-wrap break-words">{note.rollback_plan}</p>
                    </div>
                  )}
                  {note.edited_at && (
                    <p className="text-[10px] text-muted-foreground font-mono italic">
                      última edição: {new Date(note.edited_at).toLocaleString('pt-BR')}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
          );
        })}
        {notes?.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhuma nota registrada</p>
        )}
      </div>

      {/* Delete Ticket Dialog */}
      <Dialog open={deleteTicketOpen} onOpenChange={setDeleteTicketOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Ticket</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este ticket? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTicketOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTicket.mutate()} disabled={deleteTicket.isPending}>
              {deleteTicket.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Note Dialog */}
      <Dialog open={!!deleteNoteId} onOpenChange={() => setDeleteNoteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Nota</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta nota?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNoteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteNoteId && deleteNote.mutate(deleteNoteId)} disabled={deleteNote.isPending}>
              {deleteNote.isPending ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TicketDetail;

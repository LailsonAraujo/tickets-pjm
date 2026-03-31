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
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Play, Pause, Clock, Plus, Save } from 'lucide-react';
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
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: ticket } = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*, profiles:created_by(display_name), assigned_profile:assigned_to(display_name)').eq('id', id!).single();
      return data;
    },
  });

  const { data: notes } = useQuery({
    queryKey: ['ticket-notes', id],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_notes').select('*, profiles:author_id(display_name)').eq('ticket_id', id!).order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive]);

  const canEditTicket = isAdmin || ticket?.assigned_to === user?.id || ticket?.created_by === user?.id;

  const updateStatus = useMutation({
    mutationFn: async (status: Enums<'ticket_status'>) => {
      const { error } = await supabase.from('tickets').update({ status, closed_at: status === 'concluido' ? new Date().toISOString() : null }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      toast({ title: 'Status atualizado!' });
    },
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

      // Auto-transfer: if current user is not the assigned tech, transfer ticket to them
      if (ticket && ticket.assigned_to !== user!.id) {
        await supabase.from('tickets').update({ assigned_to: user!.id }).eq('id', id!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-notes', id] });
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      setNewNote({ description: '', what_was_done: '', rollback_plan: '', time_spent_seconds: 0 });
      setShowNoteForm(false);
      setTimerActive(false);
      setTimerSeconds(0);
      toast({ title: 'Nota adicionada! Ticket transferido para você.' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  if (!ticket) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" onClick={() => navigate('/tickets')} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <Card className="noc-card">
        <CardHeader>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-xl font-mono">{ticket.title}</CardTitle>
              <p className="text-xs text-muted-foreground font-mono mt-1">#{ticket.id.slice(0, 8)} • Criado por {(ticket as any).profiles?.display_name}</p>
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
          {ticket.description && <p className="text-sm">{ticket.description}</p>}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline">{ticket.priority}</Badge>
            <Badge variant="outline">{ticket.category}</Badge>
            {(ticket as any).assigned_profile?.display_name && (
              <Badge variant="outline">Resp: {(ticket as any).assigned_profile.display_name}</Badge>
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
                <Button variant="outline" size="sm" onClick={() => { setTimerActive(!timerActive); if (!timerActive && timerSeconds === 0) setTimerSeconds(0); }} className="gap-1 font-mono">
                  {timerActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  {formatTime(timerSeconds)}
                </Button>
              </div>
            </div>
            {ticket.assigned_to && ticket.assigned_to !== user?.id && (
              <div className="p-2 rounded bg-warning/10 border border-warning/20">
                <p className="text-xs font-mono text-warning">⚠ Este ticket será automaticamente transferido para você ao salvar a nota.</p>
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
        {notes?.map((note: any) => (
          <Card key={note.id} className="noc-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{note.profiles?.display_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono">{formatTime(note.time_spent_seconds)}</span>
                  <span>•</span>
                  <span>{new Date(note.created_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>
              <p className="text-sm">{note.description}</p>
              {note.what_was_done && (
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground font-mono mb-1">O QUE FOI APLICADO:</p>
                  <p className="text-sm">{note.what_was_done}</p>
                </div>
              )}
              {note.rollback_plan && (
                <div className="p-2 rounded bg-warning/10">
                  <p className="text-xs text-warning font-mono mb-1">ROLLBACK:</p>
                  <p className="text-sm">{note.rollback_plan}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {notes?.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhuma nota registrada</p>
        )}
      </div>
    </div>
  );
};

export default TicketDetail;

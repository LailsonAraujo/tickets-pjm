import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Cable, Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Transit = {
  id: string;
  operator: string;
  link_type: string;
  bandwidth_mbps: number;
  price_per_mb: number;
  monthly_value: number;
  signed_at: string;
  validity_months: number;
  expires_at: string;
  notes: string | null;
};

const emptyForm = {
  operator: '',
  link_type: 'transito',
  bandwidth_mbps: '',
  price_per_mb: '',
  signed_at: format(new Date(), 'yyyy-MM-dd'),
  validity_months: '12',
  notes: '',
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const previewExpiry = (signed: string, months: string) => {
  if (!signed || !months) return '—';
  const d = parseISO(signed);
  if (isNaN(d.getTime())) return '—';
  d.setMonth(d.getMonth() + Number(months || 0));
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
};

const Transits = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);

  if (!isAdmin) return <Navigate to="/" replace />;

  const { data: transits } = useQuery({
    queryKey: ['transits'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transits' as any).select('*').order('expires_at');
      if (error) throw error;
      return (data ?? []) as unknown as Transit[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        operator: form.operator,
        link_type: form.link_type,
        bandwidth_mbps: Number(form.bandwidth_mbps),
        price_per_mb: Number(form.price_per_mb),
        signed_at: form.signed_at,
        validity_months: Number(form.validity_months),
        notes: form.notes || null,
      };
      if (editId) {
        const { error } = await supabase.from('transits' as any).update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('transits' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transits'] });
      setCreateOpen(false);
      setEditId(null);
      setForm(emptyForm);
      toast({ title: editId ? 'Contrato atualizado!' : 'Contrato cadastrado!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transits' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transits'] });
      toast({ title: 'Contrato removido' });
    },
  });

  const openEdit = (t: Transit) => {
    setEditId(t.id);
    setForm({
      operator: t.operator,
      link_type: t.link_type,
      bandwidth_mbps: String(t.bandwidth_mbps),
      price_per_mb: String(t.price_per_mb),
      signed_at: t.signed_at,
      validity_months: String(t.validity_months),
      notes: t.notes ?? '',
    });
    setCreateOpen(true);
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setCreateOpen(true);
  };

  const totalMonthly = (transits ?? []).reduce((s, t) => s + Number(t.monthly_value || 0), 0);
  const totalBw = (transits ?? []).reduce((s, t) => s + Number(t.bandwidth_mbps || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
            <Cable className="h-6 w-6 text-primary" />
            Trânsito & Transporte
          </h1>
          <p className="text-muted-foreground text-sm">Contratos de links, banda contratada e vencimentos</p>
        </div>
        <Button className="gap-2 font-mono" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo Contrato
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="noc-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-mono">Contratos ativos</p>
          <p className="text-2xl font-mono font-bold">{transits?.length ?? 0}</p>
        </CardContent></Card>
        <Card className="noc-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-mono">Banda total</p>
          <p className="text-2xl font-mono font-bold">{totalBw.toLocaleString('pt-BR')} Mbps</p>
        </CardContent></Card>
        <Card className="noc-card"><CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-mono">Custo mensal total</p>
          <p className="text-2xl font-mono font-bold text-primary">{brl(totalMonthly)}</p>
        </CardContent></Card>
      </div>

      <div className="space-y-2">
        {transits?.map(t => {
          const days = differenceInDays(parseISO(t.expires_at), new Date());
          const expired = days < 0;
          const soon = !expired && days <= 30;
          return (
            <Card key={t.id} className="noc-card">
              <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Cable className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium font-mono">{t.operator}</p>
                      <Badge variant="outline" className="uppercase text-[10px]">{t.link_type}</Badge>
                      {expired && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />VENCIDO</Badge>}
                      {soon && <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/40">vence em {days}d</Badge>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground font-mono mt-1">
                      <span>{Number(t.bandwidth_mbps).toLocaleString('pt-BR')} Mbps</span>
                      <span>{brl(t.price_per_mb)}/Mb</span>
                      <span className="text-primary">{brl(t.monthly_value)}/mês</span>
                      <span>Assinado: {format(parseISO(t.signed_at), 'dd/MM/yyyy')}</span>
                      <span>Vence: {format(parseISO(t.expires_at), 'dd/MM/yyyy')} ({t.validity_months}m)</span>
                    </div>
                    {t.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{t.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O contrato de <strong>{t.operator}</strong> será removido permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {transits?.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhum contrato cadastrado</p>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) { setEditId(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono">{editId ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label>Operadora *</Label>
                <Input value={form.operator} onChange={e => setForm({ ...form, operator: e.target.value })} placeholder="Ex: Vivo, Claro, Algar" required />
              </div>
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={form.link_type} onValueChange={v => setForm({ ...form, link_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transito">Trânsito</SelectItem>
                    <SelectItem value="transporte">Transporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Banda contratada (Mbps) *</Label>
                <Input type="number" min="0" step="1" value={form.bandwidth_mbps} onChange={e => setForm({ ...form, bandwidth_mbps: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Valor por Mb (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={form.price_per_mb} onChange={e => setForm({ ...form, price_per_mb: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Valor mensal estimado</Label>
                <Input readOnly value={brl(Number(form.bandwidth_mbps || 0) * Number(form.price_per_mb || 0))} className="bg-muted font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Assinatura do contrato *</Label>
                <Input type="date" value={form.signed_at} onChange={e => setForm({ ...form, signed_at: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Validade (meses) *</Label>
                <Input type="number" min="1" step="1" value={form.validity_months} onChange={e => setForm({ ...form, validity_months: e.target.value })} required />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Vencimento calculado</Label>
                <Input readOnly value={previewExpiry(form.signed_at, form.validity_months)} className="bg-muted font-mono text-primary" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Ex: designação, POP, contato comercial..." />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : editId ? 'Salvar alterações' : 'Cadastrar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Transits;

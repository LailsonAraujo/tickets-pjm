import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Pencil, Trash2, Users as UsersIcon } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const Providers = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [membersFor, setMembersFor] = useState<{ id: string; name: string } | null>(null);

  if (!isAdmin) return <Navigate to="/" replace />;

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data } = await supabase.from('providers').select('*').order('name');
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['profiles-all'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, display_name').order('display_name');
      return data ?? [];
    },
  });

  const { data: memberships } = useQuery({
    queryKey: ['user-providers'],
    queryFn: async () => {
      const { data } = await supabase.from('user_providers').select('*');
      return data ?? [];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['providers'] });
    qc.invalidateQueries({ queryKey: ['user-providers'] });
  };

  const createProvider = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('providers').insert({ name: form.name, description: form.description || null });
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); setCreateOpen(false); setForm({ name: '', description: '' }); toast({ title: 'Provedor criado!' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const updateProvider = useMutation({
    mutationFn: async () => {
      if (!editId) return;
      const { error } = await supabase.from('providers').update({ name: editForm.name, description: editForm.description || null }).eq('id', editId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); setEditId(null); toast({ title: 'Provedor atualizado!' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteProvider = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('providers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast({ title: 'Provedor excluído!' }); },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const toggleMember = useMutation({
    mutationFn: async ({ userId, providerId, add }: { userId: string; providerId: string; add: boolean }) => {
      if (add) {
        const { error } = await supabase.from('user_providers').insert({ user_id: userId, provider_id: providerId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_providers').delete().eq('user_id', userId).eq('provider_id', providerId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-providers'] }),
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const memberCount = (providerId: string) => memberships?.filter(m => m.provider_id === providerId).length ?? 0;
  const isMember = (userId: string, providerId: string) => !!memberships?.find(m => m.user_id === userId && m.provider_id === providerId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Provedores
          </h1>
          <p className="text-muted-foreground text-sm">Gerencie provedores e membros vinculados</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 font-mono"><Plus className="h-4 w-4" /> Novo Provedor</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="font-mono">Criar Provedor</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createProvider.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: AVIX Telecom" required />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Opcional" />
              </div>
              <Button type="submit" className="w-full" disabled={createProvider.isPending}>
                {createProvider.isPending ? 'Criando...' : 'Criar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {providers?.map(p => (
          <Card key={p.id} className="noc-card">
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <UsersIcon className="h-3 w-3" /> {memberCount(p.id)} membros
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setMembersFor({ id: p.id, name: p.name })}>
                  Membros
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { setEditId(p.id); setEditForm({ name: p.name, description: p.description ?? '' }); }}>
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
                      <AlertDialogTitle>Excluir provedor?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O provedor <strong>{p.name}</strong> será removido. Tickets associados ficarão sem provedor.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteProvider.mutate(p.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        ))}
        {providers?.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">Nenhum provedor cadastrado</p>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={open => !open && setEditId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-mono">Editar Provedor</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); updateProvider.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
            </div>
            <Button type="submit" className="w-full" disabled={updateProvider.isPending}>
              {updateProvider.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={!!membersFor} onOpenChange={open => !open && setMembersFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono">Membros — {membersFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {profiles?.map(prof => {
              const member = membersFor ? isMember(prof.user_id, membersFor.id) : false;
              return (
                <div key={prof.user_id} className="flex items-center justify-between p-2 rounded border border-border">
                  <span className="text-sm">{prof.display_name}</span>
                  <Button
                    size="sm"
                    variant={member ? 'default' : 'outline'}
                    onClick={() => membersFor && toggleMember.mutate({ userId: prof.user_id, providerId: membersFor.id, add: !member })}
                    disabled={toggleMember.isPending}
                  >
                    {member ? 'Vinculado' : 'Vincular'}
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersFor(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Providers;

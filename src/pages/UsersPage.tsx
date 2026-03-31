import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Users as UsersIcon, Shield, Plus } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import type { Enums } from '@/integrations/supabase/types';

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  tecnico: 'Técnico',
  suporte: 'Suporte',
  user: 'Usuário',
};

const UsersPage = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', display_name: '', role: 'user' as Enums<'app_role'> });

  if (!isAdmin) return <Navigate to="/" replace />;

  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('created_at');
      return data ?? [];
    },
  });

  const { data: allRoles } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_roles').select('*');
      return data ?? [];
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Enums<'app_role'> }) => {
      await supabase.from('user_roles').delete().eq('user_id', userId);
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast({ title: 'Role atualizada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: newUser,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      setDialogOpen(false);
      setNewUser({ email: '', password: '', display_name: '', role: 'user' });
      toast({ title: 'Usuário criado com sucesso!' });
    },
    onError: (err: any) => toast({ title: 'Erro ao criar usuário', description: err.message, variant: 'destructive' }),
  });

  const getUserRole = (userId: string) => {
    return allRoles?.find(r => r.user_id === userId)?.role ?? 'user';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-primary" />
            Gestão de Usuários
          </h1>
          <p className="text-muted-foreground text-sm">Gerenciar colaboradores e permissões</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 font-mono"><Plus className="h-4 w-4" /> Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-mono">Criar Usuário</DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createUser.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={newUser.display_name} onChange={e => setNewUser({ ...newUser, display_name: e.target.value })} placeholder="Nome completo" required />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="email@exemplo.com" required className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Senha *</Label>
                <Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Mínimo 6 caracteres" required minLength={6} />
              </div>
              <div className="space-y-2">
                <Label>Função</Label>
                <Select value={newUser.role} onValueChange={v => setNewUser({ ...newUser, role: v as Enums<'app_role'> })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="tecnico">Técnico</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={createUser.isPending}>
                {createUser.isPending ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {profiles?.map(profile => (
          <Card key={profile.id} className="noc-card">
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-mono font-bold text-primary">
                    {(profile.display_name ?? 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{profile.display_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{profile.user_id.slice(0, 8)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={profile.is_active ? 'default' : 'secondary'}>
                  {profile.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
                <Select value={getUserRole(profile.user_id)} onValueChange={v => changeRole.mutate({ userId: profile.user_id, role: v as Enums<'app_role'> })}>
                  <SelectTrigger className="w-[130px]">
                    <Shield className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="tecnico">Técnico</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                    <SelectItem value="user">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default UsersPage;

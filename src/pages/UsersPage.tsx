import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Users as UsersIcon, Shield } from 'lucide-react';
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
      // Delete existing roles
      await supabase.from('user_roles').delete().eq('user_id', userId);
      // Insert new role
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      toast({ title: 'Role atualizada!' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  const getUserRole = (userId: string) => {
    return allRoles?.find(r => r.user_id === userId)?.role ?? 'user';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
          <UsersIcon className="h-6 w-6 text-primary" />
          Gestão de Usuários
        </h1>
        <p className="text-muted-foreground text-sm">Gerenciar colaboradores e permissões</p>
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

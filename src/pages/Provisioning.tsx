import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Zap, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const Provisioning = () => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [cliente, setCliente] = useState('');
  const [serialOnu, setSerialOnu] = useState('');
  const [pppoe, setPppoe] = useState('');
  const [vlan, setVlan] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, display_name').eq('is_active', true);
      return data ?? [];
    },
  });

  const { data: myProviders } = useQuery({
    queryKey: ['my-providers', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('user_providers').select('provider_id').eq('user_id', user.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: allProviders } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data } = await supabase.from('providers').select('id, name').order('name');
      return data ?? [];
    },
  });

  const availableProviders = isAdmin
    ? (allProviders ?? [])
    : (allProviders ?? []).filter(p => myProviders?.some(m => m.provider_id === p.id));

  const [providerId, setProviderId] = useState<string>('');

  const provision = useMutation({
    mutationFn: async () => {
      const chosenProvider = providerId || myProviders?.[0]?.provider_id;
      if (!chosenProvider) throw new Error('Você não está vinculado a nenhum provedor.');
      // Create ticket already completed
      const { data: ticket, error } = await supabase.from('tickets').insert({
        title: `Provisionamento ONU - ${cliente}`,
        description: `Cliente: ${cliente}\nSerial ONU: ${serialOnu}\nPPPoE: ${pppoe}\nVLAN: ${vlan}`,
        status: 'concluido' as const,
        priority: 'media' as const,
        category: 'provisionamento' as const,
        assigned_to: assignedTo || user!.id,
        created_by: user!.id,
        closed_at: new Date().toISOString(),
        provider_id: chosenProvider,
      }).select('id').single();
      if (error) throw error;

      // Auto-create note with default time
      await supabase.from('ticket_notes').insert({
        ticket_id: ticket.id,
        author_id: user!.id,
        description: `Provisionamento de ONU para cliente ${cliente}`,
        what_was_done: `ONU provisionada - Serial: ${serialOnu}, PPPoE: ${pppoe}, VLAN: ${vlan}`,
        time_spent_seconds: 900, // 15min default
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['tickets-summary'] });
      setSuccess(true);
      toast({ title: 'ONU provisionada com sucesso!' });
      setTimeout(() => {
        setSuccess(false);
        setCliente('');
        setSerialOnu('');
        setPppoe('');
        setVlan('');
        setAssignedTo('');
      }, 3000);
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          Provisionamento Rápido
        </h1>
        <p className="text-muted-foreground text-sm">Provisionar ONU com ticket automático</p>
      </div>

      {success ? (
        <Card className="noc-card border-primary/30 noc-glow">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-xl font-bold font-mono">Provisionamento Concluído!</h2>
            <p className="text-muted-foreground text-sm">Ticket gerado automaticamente</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="noc-card">
          <CardHeader>
            <CardTitle className="font-mono text-lg">Dados da ONU</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={e => { e.preventDefault(); provision.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome do cliente" required />
              </div>
              <div className="space-y-2">
                <Label>Serial da ONU *</Label>
                <Input value={serialOnu} onChange={e => setSerialOnu(e.target.value)} placeholder="HWTC-XXXXXXXX" required className="font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PPPoE *</Label>
                  <Input value={pppoe} onChange={e => setPppoe(e.target.value)} placeholder="usuario@isp" required className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>VLAN *</Label>
                  <Input value={vlan} onChange={e => setVlan(e.target.value)} placeholder="100" required className="font-mono" />
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
                  <p className="text-xs text-destructive">Você não está vinculado a nenhum provedor.</p>
                )}
              </div>
              <Button type="submit" className="w-full gap-2" disabled={provision.isPending || !providerId}>
                <Zap className="h-4 w-4" />
                {provision.isPending ? 'Provisionando...' : 'Provisionar ONU'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Provisioning;

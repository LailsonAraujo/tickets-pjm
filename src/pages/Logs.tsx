import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollText, Clock } from 'lucide-react';
import { Navigate } from 'react-router-dom';

const Logs = () => {
  const { isAdmin } = useAuth();

  if (!isAdmin) return <Navigate to="/" replace />;

  const { data: logs, isLoading } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('*, profiles:user_id(display_name)')
        .order('created_at', { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" />
          Logs de Auditoria
        </h1>
        <p className="text-muted-foreground text-sm">Histórico completo de alterações</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : logs && logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map((log: any) => (
            <Card key={log.id} className="noc-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <div>
                      <p className="text-sm font-medium">{log.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.profiles?.display_name ?? 'Sistema'} • {log.table_name ?? ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
                {(log.old_value || log.new_value) && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {log.old_value && (
                      <div className="p-2 rounded bg-destructive/10">
                        <span className="font-mono text-destructive">ANTES:</span>
                        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{JSON.stringify(log.old_value, null, 2)}</pre>
                      </div>
                    )}
                    {log.new_value && (
                      <div className="p-2 rounded bg-success/10">
                        <span className="font-mono text-success">DEPOIS:</span>
                        <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{JSON.stringify(log.new_value, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <ScrollText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Nenhum log registrado</p>
        </div>
      )}
    </div>
  );
};

export default Logs;

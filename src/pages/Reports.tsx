import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, startOfMonth, endOfDay, startOfDay, differenceInSeconds } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarIcon, FileDown, FileSpreadsheet, BarChart3, PieChart as PieIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type PeriodOption = 'week' | 'month' | 'custom' | 'all';

interface TechMetrics {
  user_id: string;
  display_name: string;
  assigned: number;
  closed: number;
  open: number;
  totalSeconds: number;
  avgResolutionSeconds: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
}

const formatDuration = (seconds: number) => {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
};

const Reports = () => {
  const { toast } = useToast();
  const [period, setPeriod] = useState<PeriodOption>('month');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (period === 'week') return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfDay(now) };
    if (period === 'month') return { from: startOfMonth(now), to: endOfDay(now) };
    if (period === 'custom') return { from: customFrom ? startOfDay(customFrom) : undefined, to: customTo ? endOfDay(customTo) : undefined };
    return { from: undefined, to: undefined };
  }, [period, customFrom, customTo]);

  const periodLabel = useMemo(() => {
    if (period === 'all') return 'Todo o período';
    if (!from || !to) return 'Período não definido';
    return `${format(from, 'dd/MM/yyyy', { locale: ptBR })} a ${format(to, 'dd/MM/yyyy', { locale: ptBR })}`;
  }, [period, from, to]);

  const { data: profiles } = useQuery({
    queryKey: ['reports-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, display_name').eq('is_active', true);
      return data ?? [];
    },
  });

  const { data: tickets } = useQuery({
    queryKey: ['reports-tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('id, status, priority, category, assigned_to, created_at, closed_at');
      return data ?? [];
    },
  });

  const { data: notes } = useQuery({
    queryKey: ['reports-notes'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_notes').select('author_id, time_spent_seconds, created_at');
      return data ?? [];
    },
  });

  const inRange = (dateStr: string | null) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const metrics: TechMetrics[] = useMemo(() => {
    if (!profiles) return [];
    return profiles.map(p => {
      const userTickets = (tickets ?? []).filter(t => t.assigned_to === p.user_id);
      const inPeriodTickets = userTickets.filter(t => inRange(t.created_at) || inRange(t.closed_at));
      const closed = userTickets.filter(t => t.status === 'concluido' && inRange(t.closed_at));
      const open = userTickets.filter(t => t.status !== 'concluido' && t.status !== 'cancelado');
      const userNotes = (notes ?? []).filter(n => n.author_id === p.user_id && inRange(n.created_at));
      const totalSeconds = userNotes.reduce((sum, n) => sum + (n.time_spent_seconds ?? 0), 0);

      const resolutionTimes = closed
        .filter(t => t.created_at && t.closed_at)
        .map(t => differenceInSeconds(new Date(t.closed_at!), new Date(t.created_at)));
      const avgResolutionSeconds = resolutionTimes.length
        ? Math.floor(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
        : 0;

      const byCategory: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      inPeriodTickets.forEach(t => {
        byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
        byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
      });

      return {
        user_id: p.user_id,
        display_name: p.display_name ?? 'Sem nome',
        assigned: inPeriodTickets.length,
        closed: closed.length,
        open: open.length,
        totalSeconds,
        avgResolutionSeconds,
        byCategory,
        byPriority,
      };
    }).filter(m => m.assigned > 0 || m.closed > 0 || m.totalSeconds > 0)
      .sort((a, b) => b.closed - a.closed);
  }, [profiles, tickets, notes, from, to]);

  const totals = useMemo(() => ({
    assigned: metrics.reduce((s, m) => s + m.assigned, 0),
    closed: metrics.reduce((s, m) => s + m.closed, 0),
    open: metrics.reduce((s, m) => s + m.open, 0),
    seconds: metrics.reduce((s, m) => s + m.totalSeconds, 0),
  }), [metrics]);

  const exportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Relatório de Produtividade por Técnico', 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Período: ${periodLabel}`, 14, 25);
      doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 30);

      autoTable(doc, {
        startY: 36,
        head: [['Técnico', 'Atribuídos', 'Fechados', 'Em aberto', 'Horas', 'Tempo médio resolução']],
        body: metrics.map(m => [
          m.display_name,
          m.assigned,
          m.closed,
          m.open,
          formatDuration(m.totalSeconds),
          formatDuration(m.avgResolutionSeconds),
        ]),
        foot: [['TOTAL', totals.assigned, totals.closed, totals.open, formatDuration(totals.seconds), '']],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 41, 59] },
        footStyles: { fillColor: [30, 41, 59], textColor: 255 },
      });

      let y = (doc as any).lastAutoTable.finalY + 10;
      metrics.forEach(m => {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(m.display_name, 14, y);
        y += 5;
        doc.setFontSize(8);
        doc.setTextColor(80);
        const cat = Object.entries(m.byCategory).map(([k, v]) => `${k}: ${v}`).join(' | ') || '—';
        const pri = Object.entries(m.byPriority).map(([k, v]) => `${k}: ${v}`).join(' | ') || '—';
        doc.text(`Categorias → ${cat}`, 14, y); y += 4;
        doc.text(`Prioridades → ${pri}`, 14, y); y += 8;
      });

      doc.save(`relatorio-tecnicos-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF gerado com sucesso' });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar PDF', description: e.message, variant: 'destructive' });
    }
  };

  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const summary = metrics.map(m => ({
        Técnico: m.display_name,
        'Tickets atribuídos': m.assigned,
        'Tickets fechados': m.closed,
        'Em aberto': m.open,
        'Horas trabalhadas': formatDuration(m.totalSeconds),
        'Segundos trabalhados': m.totalSeconds,
        'Tempo médio resolução': formatDuration(m.avgResolutionSeconds),
      }));
      const ws1 = XLSX.utils.json_to_sheet(summary);
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumo');

      const breakdown: any[] = [];
      metrics.forEach(m => {
        Object.entries(m.byCategory).forEach(([cat, qty]) => {
          breakdown.push({ Técnico: m.display_name, Tipo: 'Categoria', Valor: cat, Quantidade: qty });
        });
        Object.entries(m.byPriority).forEach(([pri, qty]) => {
          breakdown.push({ Técnico: m.display_name, Tipo: 'Prioridade', Valor: pri, Quantidade: qty });
        });
      });
      const ws2 = XLSX.utils.json_to_sheet(breakdown);
      XLSX.utils.book_append_sheet(wb, ws2, 'Distribuição');

      const meta = [
        { Campo: 'Período', Valor: periodLabel },
        { Campo: 'Gerado em', Valor: format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR }) },
        { Campo: 'Total atribuídos', Valor: totals.assigned },
        { Campo: 'Total fechados', Valor: totals.closed },
        { Campo: 'Total horas', Valor: formatDuration(totals.seconds) },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(meta), 'Info');

      XLSX.writeFile(wb, `relatorio-tecnicos-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast({ title: 'Excel gerado com sucesso' });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar Excel', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-mono flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Relatórios por Técnico
          </h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportPDF} variant="outline" className="gap-2">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button onClick={exportExcel} variant="outline" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      <Card className="noc-card">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={period} onValueChange={(v: PeriodOption) => setPeriod(v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === 'custom' && (
            <>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">De</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-44 justify-start gap-2', !customFrom && 'text-muted-foreground')}>
                      <CalendarIcon className="h-4 w-4" />
                      {customFrom ? format(customFrom, 'dd/MM/yyyy') : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Até</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-44 justify-start gap-2', !customTo && 'text-muted-foreground')}>
                      <CalendarIcon className="h-4 w-4" />
                      {customTo ? format(customTo, 'dd/MM/yyyy') : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="noc-card"><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Total atribuídos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold font-mono">{totals.assigned}</p></CardContent></Card>
        <Card className="noc-card"><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Fechados</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold font-mono text-success">{totals.closed}</p></CardContent></Card>
        <Card className="noc-card"><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Em aberto</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold font-mono text-warning">{totals.open}</p></CardContent></Card>
        <Card className="noc-card"><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Horas totais</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold font-mono text-primary">{formatDuration(totals.seconds)}</p></CardContent></Card>
      </div>

      <Card className="noc-card">
        <CardHeader><CardTitle className="text-base">Desempenho por técnico</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Técnico</TableHead>
                <TableHead className="text-right">Atribuídos</TableHead>
                <TableHead className="text-right">Fechados</TableHead>
                <TableHead className="text-right">Em aberto</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Tempo médio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem dados no período</TableCell></TableRow>
              )}
              {metrics.map(m => (
                <TableRow key={m.user_id}>
                  <TableCell className="font-medium">{m.display_name}</TableCell>
                  <TableCell className="text-right font-mono">{m.assigned}</TableCell>
                  <TableCell className="text-right font-mono text-success">{m.closed}</TableCell>
                  <TableCell className="text-right font-mono text-warning">{m.open}</TableCell>
                  <TableCell className="text-right font-mono">{formatDuration(m.totalSeconds)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{formatDuration(m.avgResolutionSeconds)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {metrics.map(m => (
          <Card key={m.user_id} className="noc-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{m.display_name}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Por categoria</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(m.byCategory).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  {Object.entries(m.byCategory).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-xs">{k}: {v}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Por prioridade</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(m.byPriority).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  {Object.entries(m.byPriority).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-xs">{k}: {v}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Reports;

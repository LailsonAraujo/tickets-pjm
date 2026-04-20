import { useState, useMemo, useRef } from 'react';
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
import html2canvas from 'html2canvas';
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
  const [exporting, setExporting] = useState(false);
  const chartCompareRef = useRef<HTMLDivElement>(null);
  const chartHoursRef = useRef<HTMLDivElement>(null);
  const chartPiesRef = useRef<HTMLDivElement>(null);
  const chartAvgRef = useRef<HTMLDivElement>(null);

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

  const captureChart = async (el: HTMLElement | null) => {
    if (!el) return null;
    const canvas = await html2canvas(el, {
      backgroundColor: '#0a0a0a',
      scale: 2,
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL('image/png');
  };

  const addChartToPDF = (doc: jsPDF, img: string | null, title: string, startY: number): number => {
    if (!img) return startY;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const imgW = pageW - 28;
    const props = (doc as any).getImageProperties(img);
    const imgH = (props.height * imgW) / props.width;
    if (startY + imgH + 12 > pageH - 10) {
      doc.addPage();
      startY = 20;
    }
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(title, 14, startY);
    doc.addImage(img, 'PNG', 14, startY + 4, imgW, imgH);
    return startY + imgH + 12;
  };

  const exportPDF = async () => {
    try {
      setExporting(true);
      // Wait a tick so any "exporting" UI changes apply (and charts stay mounted)
      await new Promise(r => setTimeout(r, 50));

      const [imgCompare, imgHours, imgPies, imgAvg] = await Promise.all([
        captureChart(chartCompareRef.current),
        captureChart(chartHoursRef.current),
        captureChart(chartPiesRef.current),
        captureChart(chartAvgRef.current),
      ]);

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();

      // Cover / header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageW, 32, 'F');
      doc.setTextColor(255);
      doc.setFontSize(18);
      doc.text('Relatório de Produtividade', 14, 15);
      doc.setFontSize(11);
      doc.text('NOC / Tech Support — PJM Net', 14, 23);
      doc.setFontSize(9);
      doc.setTextColor(200);
      doc.text(`Período: ${periodLabel}`, 14, 29);
      doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageW - 14, 29, { align: 'right' });

      // KPIs
      doc.setTextColor(0);
      doc.setFontSize(12);
      doc.text('Resumo geral', 14, 42);
      autoTable(doc, {
        startY: 45,
        head: [['Total atribuídos', 'Fechados', 'Em aberto', 'Horas totais', 'Técnicos ativos']],
        body: [[totals.assigned, totals.closed, totals.open, formatDuration(totals.seconds), metrics.length]],
        theme: 'grid',
        styles: { fontSize: 10, halign: 'center' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      });

      // Main table
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 6,
        head: [['Técnico', 'Atribuídos', 'Fechados', 'Em aberto', 'Horas', 'Tempo médio resolução', '% Fechados']],
        body: metrics.map(m => [
          m.display_name,
          m.assigned,
          m.closed,
          m.open,
          formatDuration(m.totalSeconds),
          formatDuration(m.avgResolutionSeconds),
          m.assigned ? `${Math.round((m.closed / m.assigned) * 100)}%` : '—',
        ]),
        foot: [['TOTAL', totals.assigned, totals.closed, totals.open, formatDuration(totals.seconds), '', totals.assigned ? `${Math.round((totals.closed / totals.assigned) * 100)}%` : '—']],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 41, 59] },
        footStyles: { fillColor: [30, 41, 59], textColor: 255 },
      });

      // Aggregated category / priority
      const aggCat: Record<string, number> = {};
      const aggPri: Record<string, number> = {};
      metrics.forEach(m => {
        Object.entries(m.byCategory).forEach(([k, v]) => { aggCat[k] = (aggCat[k] ?? 0) + v; });
        Object.entries(m.byPriority).forEach(([k, v]) => { aggPri[k] = (aggPri[k] ?? 0) + v; });
      });

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 6,
        head: [['Distribuição agregada — Categoria', 'Qtd', '%']],
        body: Object.entries(aggCat).map(([k, v]) => [k, v, totals.assigned ? `${Math.round((v / totals.assigned) * 100)}%` : '—']),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 4,
        head: [['Distribuição agregada — Prioridade', 'Qtd', '%']],
        body: Object.entries(aggPri).map(([k, v]) => [k, v, totals.assigned ? `${Math.round((v / totals.assigned) * 100)}%` : '—']),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      // Charts page(s)
      doc.addPage();
      let y = 20;
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text('Visão gráfica', 14, 14);
      y = addChartToPDF(doc, imgCompare, 'Comparativo de tickets por técnico', y);
      y = addChartToPDF(doc, imgHours, 'Horas trabalhadas por técnico', y);
      y = addChartToPDF(doc, imgPies, 'Distribuição por categoria e prioridade', y);
      y = addChartToPDF(doc, imgAvg, 'Tempo médio de resolução', y);

      // Per-tech detail
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Detalhamento por técnico', 14, 16);
      let dy = 24;
      metrics.forEach(m => {
        if (dy > 250) { doc.addPage(); dy = 20; }
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(m.display_name, 14, dy);
        dy += 5;
        doc.setFontSize(8);
        doc.setTextColor(80);
        doc.text(`Atribuídos: ${m.assigned}  |  Fechados: ${m.closed}  |  Em aberto: ${m.open}  |  Horas: ${formatDuration(m.totalSeconds)}  |  Tempo médio: ${formatDuration(m.avgResolutionSeconds)}`, 14, dy);
        dy += 4;
        const cat = Object.entries(m.byCategory).map(([k, v]) => `${k}: ${v}`).join(' | ') || '—';
        const pri = Object.entries(m.byPriority).map(([k, v]) => `${k}: ${v}`).join(' | ') || '—';
        doc.text(`Categorias → ${cat}`, 14, dy); dy += 4;
        doc.text(`Prioridades → ${pri}`, 14, dy); dy += 8;
      });

      // Footer page numbers
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Página ${i} de ${pages}`, pageW - 14, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
      }

      doc.save(`relatorio-tecnicos-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF gerado com sucesso' });
    } catch (e: any) {
      toast({ title: 'Erro ao gerar PDF', description: e.message, variant: 'destructive' });
    } finally {
      setExporting(false);
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

      {metrics.length > 0 && (
        <>
          <Card className="noc-card">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Comparativo de tickets por técnico</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={metrics.map(m => ({ name: m.display_name, Fechados: m.closed, 'Em aberto': m.open, Atribuídos: m.assigned }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <RTooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Atribuídos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Fechados" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Em aberto" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="noc-card">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Horas trabalhadas por técnico</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={metrics.map(m => ({ name: m.display_name, Horas: +(m.totalSeconds / 3600).toFixed(2) }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                  <RTooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 12 }} formatter={(v: number) => [`${v}h`, 'Horas']} />
                  <Bar dataKey="Horas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {(() => {
            const aggCat: Record<string, number> = {};
            const aggPri: Record<string, number> = {};
            metrics.forEach(m => {
              Object.entries(m.byCategory).forEach(([k, v]) => { aggCat[k] = (aggCat[k] ?? 0) + v; });
              Object.entries(m.byPriority).forEach(([k, v]) => { aggPri[k] = (aggPri[k] ?? 0) + v; });
            });
            const catData = Object.entries(aggCat).map(([name, value]) => ({ name, value }));
            const priData = Object.entries(aggPri).map(([name, value]) => ({ name, value }));
            const catColors = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];
            const priColors: Record<string, string> = {
              baixa: 'hsl(var(--muted-foreground))',
              media: 'hsl(var(--primary))',
              alta: 'hsl(var(--warning))',
              critica: 'hsl(var(--destructive))',
            };
            return (
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="noc-card">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><PieIcon className="h-4 w-4 text-primary" />Distribuição por categoria</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => `${e.name}: ${e.value}`} labelLine={false} fontSize={11}>
                          {catData.map((_, i) => <Cell key={i} fill={catColors[i % catColors.length]} />)}
                        </Pie>
                        <RTooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card className="noc-card">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><PieIcon className="h-4 w-4 text-primary" />Distribuição por prioridade</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={priData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => `${e.name}: ${e.value}`} labelLine={false} fontSize={11}>
                          {priData.map((d, i) => <Cell key={i} fill={priColors[d.name] ?? catColors[i % catColors.length]} />)}
                        </Pie>
                        <RTooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          <Card className="noc-card">
            <CardHeader><CardTitle className="text-base">Tempo médio de resolução (horas)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={metrics.map(m => ({ name: m.display_name, Horas: +(m.avgResolutionSeconds / 3600).toFixed(2) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-15} textAnchor="end" height={60} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <RTooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 12 }} formatter={(v: number) => [`${v}h`, 'Tempo médio']} />
                  <Bar dataKey="Horas" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

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

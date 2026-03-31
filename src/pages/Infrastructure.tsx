import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  FolderOpen, FolderPlus, Server, Plus, Upload, Copy, Trash2, ChevronRight, ChevronDown, Edit, Lock, Eye, EyeOff
} from 'lucide-react';
import CryptoJS from 'crypto-js';
import { XMLParser } from 'fast-xml-parser';

const CATEGORIES = ['Roteador', 'Switch', 'OLT', 'Servidor', 'VM'] as const;

type Host = {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  category: string | null;
  ip_address: string;
  port: number | null;
  username: string | null;
  encrypted_password: string | null;
  notes: string | null;
  created_at: string;
};

type Folder = {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export default function Infrastructure() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newHostOpen, setNewHostOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [masterKeyOpen, setMasterKeyOpen] = useState(false);
  const [masterKey, setMasterKey] = useState('');
  const [pendingImportHosts, setPendingImportHosts] = useState<any[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<string, string>>({});
  const [decryptKeyOpen, setDecryptKeyOpen] = useState(false);
  const [decryptKeyTarget, setDecryptKeyTarget] = useState('');
  const [decryptKey, setDecryptKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Host form state
  const [hostForm, setHostForm] = useState({
    name: '', category: 'Servidor' as string, ip_address: '', port: '22',
    username: '', password: '', notes: '', masterKey: ''
  });

  const { data: folders = [] } = useQuery({
    queryKey: ['host_folders'],
    queryFn: async () => {
      const { data, error } = await supabase.from('host_folders').select('*').order('name');
      if (error) throw error;
      return data as Folder[];
    },
  });

  const { data: hosts = [] } = useQuery({
    queryKey: ['hosts', selectedFolder],
    queryFn: async () => {
      let query = supabase.from('hosts').select('*').order('name');
      if (selectedFolder) {
        query = query.eq('folder_id', selectedFolder);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Host[];
    },
  });

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('host_folders').insert({
        user_id: user!.id, name, parent_id: selectedFolder
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['host_folders'] });
      setNewFolderOpen(false);
      setNewFolderName('');
      toast.success('Pasta criada');
    },
    onError: () => toast.error('Erro ao criar pasta'),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('host_folders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['host_folders'] });
      if (selectedFolder) setSelectedFolder(null);
      toast.success('Pasta removida');
    },
  });

  const createHost = useMutation({
    mutationFn: async (host: any) => {
      const { error } = await supabase.from('hosts').insert(host);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
      setNewHostOpen(false);
      setHostForm({ name: '', category: 'Servidor', ip_address: '', port: '22', username: '', password: '', notes: '', masterKey: '' });
      toast.success('Host adicionado');
    },
    onError: () => toast.error('Erro ao adicionar host'),
  });

  const deleteHost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hosts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
      toast.success('Host removido');
    },
  });

  const bulkInsertHosts = useMutation({
    mutationFn: async (hostsData: any[]) => {
      const { error } = await supabase.from('hosts').insert(hostsData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
      setMasterKeyOpen(false);
      setImportOpen(false);
      setMasterKey('');
      setPendingImportHosts([]);
      toast.success('Hosts importados com sucesso');
    },
    onError: () => toast.error('Erro ao importar hosts'),
  });

  const handleAddHost = () => {
    if (!hostForm.name || !hostForm.ip_address) {
      toast.error('Nome e IP são obrigatórios');
      return;
    }
    const encryptedPass = hostForm.password && hostForm.masterKey
      ? CryptoJS.AES.encrypt(hostForm.password, hostForm.masterKey).toString()
      : null;

    createHost.mutate({
      user_id: user!.id,
      folder_id: selectedFolder,
      name: hostForm.name,
      category: hostForm.category,
      ip_address: hostForm.ip_address,
      port: parseInt(hostForm.port) || 22,
      username: hostForm.username || null,
      encrypted_password: encryptedPass,
      notes: hostForm.notes || null,
    });
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
        const result = parser.parse(text);

        // Try to find sessions in various MobaXterm XML structures
        let sessions: any[] = [];
        const findSessions = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) { obj.forEach(findSessions); return; }
          // Look for items with '#text' or 'value' containing '#' separated data
          if (obj['#text'] && typeof obj['#text'] === 'string' && obj['#text'].includes('#')) {
            sessions.push({ name: obj.name || obj.Name || 'Host', value: obj['#text'] });
          }
          if (obj.value && typeof obj.value === 'string' && obj.value.includes('#')) {
            sessions.push({ name: obj.name || obj.Name || 'Host', value: obj.value });
          }
          Object.values(obj).forEach(findSessions);
        };
        findSessions(result);

        if (sessions.length === 0) {
          // Fallback: parse as INI-like
          const lines = text.split('\n');
          lines.forEach(line => {
            const match = line.match(/^(.+?)=(.+)$/);
            if (match) {
              const parts = match[2].split('#');
              if (parts.length >= 2 && parts[0].match(/\d+/)) {
                sessions.push({ name: match[1].trim(), value: match[2] });
              }
            }
          });
        }

        const parsed = sessions.map(s => {
          const data = s.value.split('#');
          return {
            name: s.name,
            ip_address: data[1] || data[0] || '',
            port: parseInt(data[2]) || 22,
            username: data[3] || '',
            raw_password: data[4] || '',
            category: s.name.toLowerCase().includes('olt') ? 'OLT'
              : s.name.toLowerCase().includes('switch') ? 'Switch'
              : s.name.toLowerCase().includes('rout') ? 'Roteador'
              : 'Servidor',
          };
        }).filter(h => h.ip_address);

        if (parsed.length === 0) {
          toast.error('Nenhum host encontrado no arquivo');
          return;
        }

        setPendingImportHosts(parsed);
        setMasterKeyOpen(true);
      } catch {
        toast.error('Erro ao processar arquivo');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = () => {
    if (!masterKey) {
      toast.error('Informe a chave mestra');
      return;
    }
    const hostsData = pendingImportHosts.map(h => ({
      user_id: user!.id,
      folder_id: selectedFolder,
      name: h.name,
      category: h.category,
      ip_address: h.ip_address,
      port: h.port,
      username: h.username || null,
      encrypted_password: h.raw_password
        ? CryptoJS.AES.encrypt(h.raw_password, masterKey).toString()
        : null,
      notes: null,
    }));
    bulkInsertHosts.mutate(hostsData);
  };

  const copySSH = (host: Host) => {
    const cmd = `ssh ${host.username || 'root'}@${host.ip_address}${host.port && host.port !== 22 ? ` -p ${host.port}` : ''}`;
    navigator.clipboard.writeText(cmd);
    toast.success('Comando SSH copiado!');
  };

  const handleDecryptPassword = (hostId: string, encrypted: string) => {
    setDecryptKeyTarget(hostId);
    setDecryptKeyOpen(true);
    setDecryptKey('');
  };

  const confirmDecrypt = (encrypted: string) => {
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, decryptKey);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted) throw new Error();
      setShowPasswords(prev => ({ ...prev, [decryptKeyTarget]: decrypted }));
      setDecryptKeyOpen(false);
      setTimeout(() => {
        setShowPasswords(prev => {
          const next = { ...prev };
          delete next[decryptKeyTarget];
          return next;
        });
      }, 10000);
    } catch {
      toast.error('Chave incorreta');
    }
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const rootFolders = folders.filter(f => !f.parent_id);
  const getChildren = (parentId: string) => folders.filter(f => f.parent_id === parentId);

  const renderFolder = (folder: Folder, depth = 0) => {
    const children = getChildren(folder.id);
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolder === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded text-sm font-mono transition-colors ${
            isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            setSelectedFolder(folder.id);
            if (children.length > 0) toggleFolder(folder.id);
          }}
        >
          {children.length > 0 ? (
            isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : <span className="w-3" />}
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="truncate">{folder.name}</span>
          <button onClick={(e) => { e.stopPropagation(); deleteFolder.mutate(folder.id); }}
            className="ml-auto opacity-0 group-hover:opacity-100 hover:text-destructive">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        {isExpanded && children.map(c => renderFolder(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">
            <Server className="inline h-6 w-6 mr-2 text-primary" />
            Infraestrutura
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">Gerenciamento de hosts e dispositivos</p>
        </div>
        <div className="flex gap-2">
          <input type="file" ref={fileInputRef} accept=".mxtpro,.xml,.ini" className="hidden" onChange={handleFileImport} />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> Importar MobaXterm
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Folder Tree */}
        <div className="border border-border rounded-md bg-card p-2 min-h-[400px]">
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Pastas</span>
            <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6"><FolderPlus className="h-4 w-4" /></Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-mono">Nova Pasta</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="Nome da pasta" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} className="font-mono" />
                  <Button onClick={() => createFolder.mutate(newFolderName)} disabled={!newFolderName} className="w-full">Criar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div
            className={`flex items-center gap-1 py-1.5 px-2 cursor-pointer rounded text-sm font-mono transition-colors ${
              selectedFolder === null ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSelectedFolder(null)}
          >
            <Server className="h-4 w-4 text-primary" />
            <span>Todos os Hosts</span>
          </div>

          {rootFolders.map(f => renderFolder(f))}
        </div>

        {/* Hosts Table */}
        <div className="border border-border rounded-md bg-card">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="text-sm font-mono text-muted-foreground">
              {hosts.length} host{hosts.length !== 1 ? 's' : ''}
            </span>
            <Dialog open={newHostOpen} onOpenChange={setNewHostOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Host</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle className="font-mono">Adicionar Host</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-mono">Nome</Label>
                    <Input value={hostForm.name} onChange={e => setHostForm(p => ({ ...p, name: e.target.value }))} className="font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs font-mono">Categoria</Label>
                    <Select value={hostForm.category} onValueChange={v => setHostForm(p => ({ ...p, category: v }))}>
                      <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs font-mono">IP</Label>
                      <Input value={hostForm.ip_address} onChange={e => setHostForm(p => ({ ...p, ip_address: e.target.value }))} className="font-mono" placeholder="192.168.1.1" />
                    </div>
                    <div>
                      <Label className="text-xs font-mono">Porta</Label>
                      <Input value={hostForm.port} onChange={e => setHostForm(p => ({ ...p, port: e.target.value }))} className="font-mono" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-mono">Usuário</Label>
                    <Input value={hostForm.username} onChange={e => setHostForm(p => ({ ...p, username: e.target.value }))} className="font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs font-mono">Senha</Label>
                    <Input type="password" value={hostForm.password} onChange={e => setHostForm(p => ({ ...p, password: e.target.value }))} className="font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs font-mono flex items-center gap-1"><Lock className="h-3 w-3" /> Chave Mestra (AES-256)</Label>
                    <Input type="password" value={hostForm.masterKey} onChange={e => setHostForm(p => ({ ...p, masterKey: e.target.value }))} className="font-mono" placeholder="Chave para criptografar a senha" />
                  </div>
                  <div>
                    <Label className="text-xs font-mono">Notas</Label>
                    <Textarea value={hostForm.notes} onChange={e => setHostForm(p => ({ ...p, notes: e.target.value }))} className="font-mono" rows={2} />
                  </div>
                  <Button onClick={handleAddHost} className="w-full" disabled={createHost.isPending}>Salvar Host</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-mono text-xs">Nome</TableHead>
                <TableHead className="font-mono text-xs">Categoria</TableHead>
                <TableHead className="font-mono text-xs">IP</TableHead>
                <TableHead className="font-mono text-xs">Porta</TableHead>
                <TableHead className="font-mono text-xs">Usuário</TableHead>
                <TableHead className="font-mono text-xs">Senha</TableHead>
                <TableHead className="font-mono text-xs text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hosts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground font-mono py-8">
                    Nenhum host encontrado
                  </TableCell>
                </TableRow>
              ) : hosts.map(host => (
                <TableRow key={host.id}>
                  <TableCell className="font-mono font-medium text-foreground">{host.name}</TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
                      {host.category}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-primary">{host.ip_address}</TableCell>
                  <TableCell className="font-mono">{host.port}</TableCell>
                  <TableCell className="font-mono">{host.username || '—'}</TableCell>
                  <TableCell className="font-mono">
                    {host.encrypted_password ? (
                      showPasswords[host.id] ? (
                        <span className="text-xs text-warning">{showPasswords[host.id]}</span>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 text-xs"
                          onClick={() => handleDecryptPassword(host.id, host.encrypted_password!)}>
                          <Eye className="h-3 w-3 mr-1" /> Ver
                        </Button>
                      )
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copySSH(host)} title="Copiar SSH">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteHost.mutate(host.id)} title="Remover">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Master Key Dialog for Import */}
      <Dialog open={masterKeyOpen} onOpenChange={setMasterKeyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-mono">Chave Mestra para Importação</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground font-mono">
            {pendingImportHosts.length} host(s) encontrados. Informe a chave mestra para criptografar as senhas com AES-256.
          </p>
          <Input type="password" value={masterKey} onChange={e => setMasterKey(e.target.value)}
            placeholder="Chave mestra" className="font-mono" />
          <Button onClick={handleConfirmImport} disabled={bulkInsertHosts.isPending} className="w-full">
            <Lock className="h-4 w-4 mr-1" /> Criptografar e Importar
          </Button>
        </DialogContent>
      </Dialog>

      {/* Decrypt Key Dialog */}
      <Dialog open={decryptKeyOpen} onOpenChange={setDecryptKeyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-mono">Descriptografar Senha</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground font-mono">Informe a chave mestra para revelar a senha (visível por 10s).</p>
          <Input type="password" value={decryptKey} onChange={e => setDecryptKey(e.target.value)}
            placeholder="Chave mestra" className="font-mono" />
          <Button onClick={() => {
            const host = hosts.find(h => h.id === decryptKeyTarget);
            if (host?.encrypted_password) confirmDecrypt(host.encrypted_password);
          }} className="w-full">
            <Eye className="h-4 w-4 mr-1" /> Revelar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

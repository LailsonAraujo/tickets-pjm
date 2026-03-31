import React, { useState, useRef } from 'react';
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
  FolderOpen, FolderPlus, Server, Plus, Upload, Copy, Trash2, ChevronRight, ChevronDown, Lock, Eye, Terminal
} from 'lucide-react';
import CryptoJS from 'crypto-js';

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

// Parse .mxtsessions INI-style file from MobaXterm
function parseMxtSessions(text: string) {
  const lines = text.split(/\r?\n/);
  const sections: { subrep: string; hosts: { name: string; ip: string; port: number; username: string }[] }[] = [];
  let currentSection: typeof sections[0] | null = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^\[Bookmarks(?:_\d+)?\]$/);
    if (sectionMatch) {
      currentSection = { subrep: '', hosts: [] };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) continue;

    const subrepMatch = line.match(/^SubRep=(.+)$/);
    if (subrepMatch) {
      currentSection.subrep = subrepMatch[1].trim();
      continue;
    }

    if (line.startsWith('ImgNum=') || !line.includes('=') || !line.includes('%')) continue;

    // Host line: name=#type#subtype%IP%Port%User%...
    const eqIdx = line.indexOf('=');
    if (eqIdx < 1) continue;
    const hostName = line.substring(0, eqIdx).trim();
    const value = line.substring(eqIdx + 1);

    // Remove the #type#subtype prefix
    const afterHash = value.replace(/^#\d+#\d+/, '');
    if (!afterHash.startsWith('%')) continue;
    const fields = afterHash.substring(1).split('%');
    const ip = fields[0] || '';
    const port = parseInt(fields[1]) || 22;
    let username = fields[2] || '';
    // Clean username: remove brackets, replace __PIPE__ with |
    username = username.replace(/^\[/, '').replace(/\]$/, '').replace(/__PIPE__/g, '|').trim();
    // Sometimes the format includes spaces around pipe
    username = username.replace(/\s*\|\s*/g, '|');

    if (!ip) continue;

    currentSection.hosts.push({ name: hostName, ip, port, username });
  }

  return sections.filter(s => s.hosts.length > 0 || s.subrep);
}

// Infer category from folder path or host name
function inferCategory(folderPath: string, hostName: string): string {
  const combined = (folderPath + ' ' + hostName).toLowerCase();
  if (combined.includes('olt')) return 'OLT';
  if (combined.includes('switch') || combined.includes('sw-l')) return 'Switch';
  if (combined.includes('rout') || combined.includes('rtr') || combined.includes('router') || combined.includes('\\ce') || combined.includes('\\router')) return 'Roteador';
  if (combined.includes('vm') || combined.includes('virtual')) return 'VM';
  if (combined.includes('servidor') || combined.includes('server') || combined.includes('serv')) return 'Servidor';
  if (combined.includes('cgnat') || combined.includes('hillstone') || combined.includes('fw-')) return 'Roteador';
  return 'Servidor';
}

export default function Infrastructure() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newHostOpen, setNewHostOpen] = useState(false);
  const [masterKeyOpen, setMasterKeyOpen] = useState(false);
  const [masterKey, setMasterKey] = useState('');
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseMxtSessions>>([]);
  const [showPasswords, setShowPasswords] = useState<Record<string, string>>({});
  const [decryptKeyOpen, setDecryptKeyOpen] = useState(false);
  const [decryptKeyTarget, setDecryptKeyTarget] = useState('');
  const [decryptKey, setDecryptKey] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const sections = parseMxtSessions(text);
        const totalHosts = sections.reduce((sum, s) => sum + s.hosts.length, 0);
        if (totalHosts === 0) {
          toast.error('Nenhum host encontrado no arquivo');
          return;
        }
        setPendingImport(sections);
        setMasterKeyOpen(true);
      } catch {
        toast.error('Erro ao processar arquivo');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    if (!masterKey) {
      toast.error('Informe a chave mestra');
      return;
    }
    try {
      // Build folder hierarchy from SubRep paths
      const folderMap = new Map<string, string>(); // path -> folder_id

      for (const section of pendingImport) {
        if (!section.subrep) continue;
        // SubRep like "PJM\OLT\HUAWEI" -> parts: ["PJM", "OLT", "HUAWEI"]
        const parts = section.subrep.split('\\');
        let parentId: string | null = null;

        for (let i = 0; i < parts.length; i++) {
          const path = parts.slice(0, i + 1).join('\\');
          if (folderMap.has(path)) {
            parentId = folderMap.get(path)!;
            continue;
          }

          // Check if folder already exists
          let query = supabase.from('host_folders').select('id')
            .eq('name', parts[i]).eq('user_id', user!.id);
          if (parentId) {
            query = query.eq('parent_id', parentId);
          } else {
            query = query.is('parent_id', null);
          }
          const { data: existing } = await query.maybeSingle();

          if (existing) {
            folderMap.set(path, existing.id);
            parentId = existing.id;
          } else {
            const { data: created, error } = await supabase.from('host_folders')
              .insert({ user_id: user!.id, name: parts[i], parent_id: parentId })
              .select('id').single();
            if (error) throw error;
            folderMap.set(path, created.id);
            parentId = created.id;
          }
        }
      }

      // Insert hosts into their folders
      const allHosts: any[] = [];
      for (const section of pendingImport) {
        const folderId = section.subrep ? (folderMap.get(section.subrep) || null) : null;
        for (const h of section.hosts) {
          // Split username|password if present
          let username = h.username;
          let password = '';
          if (username.includes('|')) {
            const uParts = username.split('|');
            username = uParts[0].trim();
            password = uParts.slice(1).join('|').trim();
          }

          allHosts.push({
            user_id: user!.id,
            folder_id: folderId,
            name: h.name,
            category: inferCategory(section.subrep, h.name),
            ip_address: h.ip,
            port: h.port,
            username: username || null,
            encrypted_password: password
              ? CryptoJS.AES.encrypt(password, masterKey).toString()
              : null,
            notes: null,
          });
        }
      }

      if (allHosts.length > 0) {
        const { error } = await supabase.from('hosts').insert(allHosts);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['host_folders'] });
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
      setMasterKeyOpen(false);
      setMasterKey('');
      setPendingImport([]);
      toast.success(`${allHosts.length} host(s) importados com sucesso!`);
    } catch (err: any) {
      toast.error('Erro ao importar: ' + (err.message || 'erro desconhecido'));
    }
  };

  const copySSH = (host: Host) => {
    const cmd = `ssh ${host.username || 'root'}@${host.ip_address}${host.port && host.port !== 22 ? ` -p ${host.port}` : ''}`;
    navigator.clipboard.writeText(cmd);
    toast.success('Comando SSH copiado!');
  };

  const openConnect = (host: Host) => {
    setConnectHost(host);
    setConnectMasterKey('');
    setConnectDecrypted(null);
    setConnectOpen(true);
  };

  const handleConnectDecrypt = () => {
    if (!connectHost?.encrypted_password || !connectMasterKey) return;
    try {
      const bytes = CryptoJS.AES.decrypt(connectHost.encrypted_password, connectMasterKey);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted) throw new Error();
      setConnectDecrypted(decrypted);
      setTimeout(() => setConnectDecrypted(null), 30000);
    } catch {
      toast.error('Chave mestra incorreta');
    }
  };

  const handleDecryptPassword = (hostId: string) => {
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
  const getFolderHostCount = (folderId: string): number => {
    // We only have hosts for currently selected folder, so just show folder structure
    return 0;
  };

  const renderFolder = (folder: Folder, depth = 0) => {
    const children = getChildren(folder.id);
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolder === folder.id;

    return (
      <div key={folder.id} className="group">
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
            className="ml-auto opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity">
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
          <input type="file" ref={fileInputRef} accept=".mxtsessions,.mxtpro,.xml,.ini" className="hidden" onChange={handleFileImport} />
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
                        <span className="text-xs text-primary">{showPasswords[host.id]}</span>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 text-xs"
                          onClick={() => handleDecryptPassword(host.id)}>
                          <Eye className="h-3 w-3 mr-1" /> Ver
                        </Button>
                      )
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openConnect(host)} title="Conectar">
                        <Terminal className="h-3.5 w-3.5 text-primary" />
                      </Button>
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

      {/* Connect Dialog */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              Conectar — {connectHost?.name}
            </DialogTitle>
          </DialogHeader>
          {connectHost && (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-md p-4 font-mono text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Host:</span>
                  <span className="text-foreground">{connectHost.ip_address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Porta:</span>
                  <span className="text-foreground">{connectHost.port || 22}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Usuário:</span>
                  <span className="text-foreground">{connectHost.username || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Senha:</span>
                  {connectDecrypted ? (
                    <span className="text-primary font-bold">{connectDecrypted}</span>
                  ) : connectHost.encrypted_password ? (
                    <span className="text-muted-foreground italic text-xs">criptografada</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>

              {connectHost.encrypted_password && !connectDecrypted && (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={connectMasterKey}
                    onChange={e => setConnectMasterKey(e.target.value)}
                    placeholder="Chave mestra para revelar senha"
                    className="font-mono"
                    onKeyDown={e => e.key === 'Enter' && handleConnectDecrypt()}
                  />
                  <Button onClick={handleConnectDecrypt} size="sm">
                    <Lock className="h-4 w-4 mr-1" /> Revelar
                  </Button>
                </div>
              )}

              <div className="bg-card border border-border rounded-md p-3">
                <p className="text-xs text-muted-foreground font-mono mb-1">Comando SSH:</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-primary font-mono flex-1">
                    ssh {connectHost.username || 'root'}@{connectHost.ip_address}
                    {connectHost.port && connectHost.port !== 22 ? ` -p ${connectHost.port}` : ''}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copySSH(connectHost)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {connectDecrypted && (
                <Button variant="outline" className="w-full font-mono" onClick={() => {
                  navigator.clipboard.writeText(connectDecrypted);
                  toast.success('Senha copiada!');
                }}>
                  <Copy className="h-4 w-4 mr-1" /> Copiar Senha
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Master Key Dialog for Import */}
      <Dialog open={masterKeyOpen} onOpenChange={setMasterKeyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-mono">Chave Mestra para Importação</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground font-mono">
            {pendingImport.reduce((sum, s) => sum + s.hosts.length, 0)} host(s) encontrados em {pendingImport.filter(s => s.subrep).length} pasta(s).
            Informe a chave mestra para criptografar as senhas com AES-256.
          </p>
          <div className="max-h-40 overflow-y-auto text-xs font-mono text-muted-foreground space-y-1 bg-secondary/30 rounded p-2">
            {pendingImport.filter(s => s.subrep).map((s, i) => (
              <div key={i}>📁 {s.subrep.replace(/\\/g, ' → ')} ({s.hosts.length} hosts)</div>
            ))}
          </div>
          <Input type="password" value={masterKey} onChange={e => setMasterKey(e.target.value)}
            placeholder="Chave mestra" className="font-mono"
            onKeyDown={e => e.key === 'Enter' && handleConfirmImport()} />
          <Button onClick={handleConfirmImport} className="w-full">
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

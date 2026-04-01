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
  FolderOpen, FolderPlus, Server, Plus, Upload, Copy, Trash2, ChevronRight, ChevronDown,
  Lock, Eye, Terminal, MonitorSmartphone, Pencil, Share2, UserPlus, KeyRound
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

type HostCredential = {
  id: string;
  host_id: string;
  user_id: string;
  username: string | null;
  encrypted_password: string | null;
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
    if (subrepMatch) { currentSection.subrep = subrepMatch[1].trim(); continue; }
    if (line.startsWith('ImgNum=') || !line.includes('=') || !line.includes('%')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx < 1) continue;
    const hostName = line.substring(0, eqIdx).trim();
    const value = line.substring(eqIdx + 1);
    const afterHash = value.replace(/^#\d+#\d+/, '');
    if (!afterHash.startsWith('%')) continue;
    const fields = afterHash.substring(1).split('%');
    const ip = fields[0] || '';
    const port = parseInt(fields[1]) || 22;
    let username = fields[2] || '';
    username = username.replace(/^\[/, '').replace(/\]$/, '').replace(/__PIPE__/g, '|').trim();
    username = username.replace(/\s*\|\s*/g, '|');
    if (!ip) continue;
    currentSection.hosts.push({ name: hostName, ip, port, username });
  }
  return sections.filter(s => s.hosts.length > 0 || s.subrep);
}

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

  // Edit host state
  const [editHostOpen, setEditHostOpen] = useState(false);
  const [editHostData, setEditHostData] = useState<Host | null>(null);

  // Share host state
  const [shareHostOpen, setShareHostOpen] = useState(false);
  const [shareHostId, setShareHostId] = useState('');
  const [shareEmail, setShareEmail] = useState('');

  // My credentials state
  const [credOpen, setCredOpen] = useState(false);
  const [credHostId, setCredHostId] = useState('');
  const [credForm, setCredForm] = useState({ username: '', password: '', masterKey: '' });

  const [hostForm, setHostForm] = useState({
    name: '', category: 'Servidor' as string, ip_address: '', port: '22',
    username: '', password: '', notes: '', masterKey: ''
  });

  // Queries
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
      if (selectedFolder) query = query.eq('folder_id', selectedFolder);
      const { data, error } = await query;
      if (error) throw error;
      return data as Host[];
    },
  });

  const { data: myCredentials = [] } = useQuery({
    queryKey: ['host_credentials', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('host_credentials')
        .select('*')
        .eq('user_id', user!.id);
      if (error) throw error;
      return data as HostCredential[];
    },
    enabled: !!user,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, display_name');
      if (error) throw error;
      return data as { user_id: string; display_name: string | null }[];
    },
  });

  // Get the effective credentials for a host (my credentials > host default)
  const getEffectiveCredentials = (host: Host) => {
    const myCred = myCredentials.find(c => c.host_id === host.id);
    if (myCred) return { username: myCred.username, encrypted_password: myCred.encrypted_password, source: 'personal' as const };
    return { username: host.username, encrypted_password: host.encrypted_password, source: 'default' as const };
  };

  // Mutations
  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('host_folders').insert({ user_id: user!.id, name, parent_id: selectedFolder });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['host_folders'] }); setNewFolderOpen(false); setNewFolderName(''); toast.success('Pasta criada'); },
    onError: () => toast.error('Erro ao criar pasta'),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('host_folders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['host_folders'] }); if (selectedFolder) setSelectedFolder(null); toast.success('Pasta removida'); },
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

  const updateHost = useMutation({
    mutationFn: async (host: Partial<Host> & { id: string }) => {
      const { id, ...updates } = host;
      const { error } = await supabase.from('hosts').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] });
      setEditHostOpen(false);
      setEditHostData(null);
      toast.success('Host atualizado');
    },
    onError: () => toast.error('Erro ao atualizar host'),
  });

  const deleteHost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('hosts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hosts'] }); toast.success('Host removido'); },
  });

  const shareHost = useMutation({
    mutationFn: async ({ hostId, email }: { hostId: string; email: string }) => {
      // Find user by display_name or email in profiles
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('user_id')
        .ilike('display_name', email)
        .maybeSingle();
      
      const targetUserId = profile?.user_id;
      if (!targetUserId) throw new Error('Usuário não encontrado');
      if (targetUserId === user!.id) throw new Error('Você não pode compartilhar consigo mesmo');

      const { error } = await supabase.from('host_shares').insert({
        host_id: hostId,
        owner_id: user!.id,
        shared_with: targetUserId,
      });
      if (error) {
        if (error.code === '23505') throw new Error('Já compartilhado com este usuário');
        throw error;
      }
    },
    onSuccess: () => {
      setShareHostOpen(false);
      setShareEmail('');
      toast.success('Host compartilhado com sucesso');
    },
    onError: (err: any) => toast.error(err.message || 'Erro ao compartilhar'),
  });

  const saveCredentials = useMutation({
    mutationFn: async ({ hostId, username, encryptedPassword }: { hostId: string; username: string; encryptedPassword: string | null }) => {
      const { error } = await supabase.from('host_credentials').upsert({
        host_id: hostId,
        user_id: user!.id,
        username: username || null,
        encrypted_password: encryptedPassword,
      }, { onConflict: 'host_id,user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['host_credentials'] });
      setCredOpen(false);
      setCredForm({ username: '', password: '', masterKey: '' });
      toast.success('Suas credenciais salvas');
    },
    onError: () => toast.error('Erro ao salvar credenciais'),
  });

  // Handlers
  const handleAddHost = () => {
    if (!hostForm.name || !hostForm.ip_address) { toast.error('Nome e IP são obrigatórios'); return; }
    const encryptedPass = hostForm.password && hostForm.masterKey
      ? CryptoJS.AES.encrypt(hostForm.password, hostForm.masterKey).toString() : null;
    createHost.mutate({
      user_id: user!.id, folder_id: selectedFolder, name: hostForm.name, category: hostForm.category,
      ip_address: hostForm.ip_address, port: parseInt(hostForm.port) || 22,
      username: hostForm.username || null, encrypted_password: encryptedPass, notes: hostForm.notes || null,
    });
  };

  const handleEditHost = () => {
    if (!editHostData) return;
    updateHost.mutate({
      id: editHostData.id,
      name: editHostData.name,
      category: editHostData.category,
      ip_address: editHostData.ip_address,
      port: editHostData.port,
      notes: editHostData.notes,
    });
  };

  const openEditHost = (host: Host) => {
    setEditHostData({ ...host });
    setEditHostOpen(true);
  };

  const openShareHost = (hostId: string) => {
    setShareHostId(hostId);
    setShareEmail('');
    setShareHostOpen(true);
  };

  const openCredentials = (hostId: string) => {
    const existing = myCredentials.find(c => c.host_id === hostId);
    setCredHostId(hostId);
    setCredForm({
      username: existing?.username || '',
      password: '',
      masterKey: '',
    });
    setCredOpen(true);
  };

  const handleSaveCredentials = () => {
    if (!credForm.username) { toast.error('Informe o usuário'); return; }
    const encryptedPass = credForm.password && credForm.masterKey
      ? CryptoJS.AES.encrypt(credForm.password, credForm.masterKey).toString() : null;
    saveCredentials.mutate({ hostId: credHostId, username: credForm.username, encryptedPassword: encryptedPass });
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
        if (totalHosts === 0) { toast.error('Nenhum host encontrado no arquivo'); return; }
        setPendingImport(sections);
        setMasterKeyOpen(true);
      } catch { toast.error('Erro ao processar arquivo'); }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmImport = async () => {
    if (!masterKey) { toast.error('Informe a chave mestra'); return; }
    try {
      const folderMap = new Map<string, string>();
      for (const section of pendingImport) {
        if (!section.subrep) continue;
        const parts = section.subrep.split('\\');
        let parentId: string | null = null;
        for (let i = 0; i < parts.length; i++) {
          const path = parts.slice(0, i + 1).join('\\');
          if (folderMap.has(path)) { parentId = folderMap.get(path)!; continue; }
          let query = supabase.from('host_folders').select('id').eq('name', parts[i]).eq('user_id', user!.id);
          if (parentId) { query = query.eq('parent_id', parentId); } else { query = query.is('parent_id', null); }
          const { data: existing } = await query.maybeSingle();
          if (existing) { folderMap.set(path, existing.id); parentId = existing.id; }
          else {
            const { data: created, error } = await supabase.from('host_folders').insert({ user_id: user!.id, name: parts[i], parent_id: parentId }).select('id').single();
            if (error) throw error;
            folderMap.set(path, created.id); parentId = created.id;
          }
        }
      }

      const allHosts: any[] = [];
      for (const section of pendingImport) {
        const folderId = section.subrep ? (folderMap.get(section.subrep) || null) : null;
        for (const h of section.hosts) {
          let username = h.username;
          let password = '';
          if (username.includes('|')) { const uParts = username.split('|'); username = uParts[0].trim(); password = uParts.slice(1).join('|').trim(); }
          allHosts.push({
            user_id: user!.id, folder_id: folderId, name: h.name,
            category: inferCategory(section.subrep, h.name), ip_address: h.ip, port: h.port,
            username: username || null,
            encrypted_password: password ? CryptoJS.AES.encrypt(password, masterKey).toString() : null,
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
      setMasterKeyOpen(false); setMasterKey(''); setPendingImport([]);
      toast.success(`${allHosts.length} host(s) importados com sucesso!`);
    } catch (err: any) { toast.error('Erro ao importar: ' + (err.message || 'erro desconhecido')); }
  };

  const copySSH = (host: Host) => {
    const creds = getEffectiveCredentials(host);
    const cmd = `ssh ${creds.username || 'root'}@${host.ip_address}${host.port && host.port !== 22 ? ` -p ${host.port}` : ''}`;
    navigator.clipboard.writeText(cmd);
    toast.success('Comando SSH copiado!');
  };

  const openSSHTerminal = (host: Host) => {
    const creds = getEffectiveCredentials(host);
    const u = creds.username || 'root';
    const port = host.port || 22;
    const sshCommand = port === 22 ? `ssh ${u}@${host.ip_address}` : `ssh ${u}@${host.ip_address} -p ${port}`;
    navigator.clipboard.writeText(sshCommand).then(() => {
      toast.success(`Comando copiado: ${sshCommand}`, { description: 'Cole no CMD, PowerShell, PuTTY ou terminal Linux.', duration: 5000 });
    }).catch(() => {
      toast.info(sshCommand, { description: 'Copie e cole no seu terminal.', duration: 8000 });
    });
  };

  const openPutty = (host: Host) => {
    const creds = getEffectiveCredentials(host);
    const u = creds.username || 'root';
    const port = host.port || 22;
    const batContent = `@echo off\r\nstart "" putty.exe -ssh ${u}@${host.ip_address} -P ${port}\r\nexit`;
    const blob = new Blob([batContent], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `connect_${host.name.replace(/[^a-zA-Z0-9]/g, '_')}.bat`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Arquivo .bat baixado — execute para abrir no PuTTY', { duration: 4000 });
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
      setTimeout(() => { setShowPasswords(prev => { const next = { ...prev }; delete next[decryptKeyTarget]; return next; }); }, 10000);
    } catch { toast.error('Chave incorreta'); }
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const rootFolders = folders.filter(f => !f.parent_id);
  const getChildren = (parentId: string) => folders.filter(f => f.parent_id === parentId);

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
          onClick={() => { setSelectedFolder(folder.id); if (children.length > 0) toggleFolder(folder.id); }}
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
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
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
                    <Label className="text-xs font-mono">Usuário (padrão)</Label>
                    <Input value={hostForm.username} onChange={e => setHostForm(p => ({ ...p, username: e.target.value }))} className="font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs font-mono">Senha (padrão)</Label>
                    <Input type="password" value={hostForm.password} onChange={e => setHostForm(p => ({ ...p, password: e.target.value }))} className="font-mono" />
                  </div>
                  <div>
                    <Label className="text-xs font-mono flex items-center gap-1"><Lock className="h-3 w-3" /> Chave Mestra (AES-256)</Label>
                    <Input type="password" value={hostForm.masterKey} onChange={e => setHostForm(p => ({ ...p, masterKey: e.target.value }))} className="font-mono" placeholder="Chave para criptografar" />
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
                <TableHead className="font-mono text-xs">Meu Usuário</TableHead>
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
              ) : hosts.map(host => {
                const creds = getEffectiveCredentials(host);
                const isOwner = host.user_id === user?.id;
                return (
                  <TableRow key={host.id}>
                    <TableCell className="font-mono font-medium text-foreground">
                      {host.name}
                      {!isOwner && (
                        <span className="ml-1 text-xs text-muted-foreground">(compartilhado)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
                        {host.category}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-primary">{host.ip_address}</TableCell>
                    <TableCell className="font-mono">{host.port}</TableCell>
                    <TableCell className="font-mono">
                      <div className="flex items-center gap-1">
                        {creds.username || '—'}
                        {creds.source === 'personal' && (
                          <KeyRound className="h-3 w-3 text-primary" title="Credencial pessoal" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">
                      {creds.encrypted_password ? (
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSSHTerminal(host)} title="Copiar SSH">
                          <Terminal className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPutty(host)} title="PuTTY">
                          <MonitorSmartphone className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCredentials(host.id)} title="Minhas Credenciais">
                          <KeyRound className="h-3.5 w-3.5 text-primary" />
                        </Button>
                        {isOwner && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditHost(host)} title="Editar">
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openShareHost(host.id)} title="Compartilhar">
                              <Share2 className="h-3.5 w-3.5 text-primary" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copySSH(host)} title="Copiar Comando">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteHost.mutate(host.id)} title="Remover">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Host Dialog */}
      <Dialog open={editHostOpen} onOpenChange={setEditHostOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-mono">Editar Host</DialogTitle></DialogHeader>
          {editHostData && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-mono">Nome</Label>
                <Input value={editHostData.name} onChange={e => setEditHostData(p => p ? { ...p, name: e.target.value } : p)} className="font-mono" />
              </div>
              <div>
                <Label className="text-xs font-mono">Categoria</Label>
                <Select value={editHostData.category || 'Servidor'} onValueChange={v => setEditHostData(p => p ? { ...p, category: v } : p)}>
                  <SelectTrigger className="font-mono"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs font-mono">IP</Label>
                  <Input value={editHostData.ip_address} onChange={e => setEditHostData(p => p ? { ...p, ip_address: e.target.value } : p)} className="font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-mono">Porta</Label>
                  <Input value={String(editHostData.port || 22)} onChange={e => setEditHostData(p => p ? { ...p, port: parseInt(e.target.value) || 22 } : p)} className="font-mono" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-mono">Notas</Label>
                <Textarea value={editHostData.notes || ''} onChange={e => setEditHostData(p => p ? { ...p, notes: e.target.value } : p)} className="font-mono" rows={2} />
              </div>
              <Button onClick={handleEditHost} className="w-full" disabled={updateHost.isPending}>Salvar Alterações</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Host Dialog */}
      <Dialog open={shareHostOpen} onOpenChange={setShareHostOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-mono flex items-center gap-2"><Share2 className="h-5 w-5" /> Compartilhar Host</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground font-mono">
            O usuário receberá acesso ao host mas precisará definir suas próprias credenciais.
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-mono">Nome do usuário</Label>
              <Select value={shareEmail} onValueChange={setShareEmail}>
                <SelectTrigger className="font-mono"><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                <SelectContent>
                  {profiles.filter(p => p.user_id !== user?.id).map(p => (
                    <SelectItem key={p.user_id} value={p.display_name || p.user_id}>
                      {p.display_name || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => shareHost.mutate({ hostId: shareHostId, email: shareEmail })}
              disabled={!shareEmail || shareHost.isPending} className="w-full">
              <UserPlus className="h-4 w-4 mr-1" /> Compartilhar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* My Credentials Dialog */}
      <Dialog open={credOpen} onOpenChange={setCredOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-mono flex items-center gap-2"><KeyRound className="h-5 w-5" /> Minhas Credenciais</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground font-mono">
            Defina seu usuário e senha pessoal para este host. Cada colaborador tem suas próprias credenciais.
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-mono">Usuário</Label>
              <Input value={credForm.username} onChange={e => setCredForm(p => ({ ...p, username: e.target.value }))} className="font-mono" />
            </div>
            <div>
              <Label className="text-xs font-mono">Senha</Label>
              <Input type="password" value={credForm.password} onChange={e => setCredForm(p => ({ ...p, password: e.target.value }))} className="font-mono" />
            </div>
            <div>
              <Label className="text-xs font-mono flex items-center gap-1"><Lock className="h-3 w-3" /> Chave Mestra (AES-256)</Label>
              <Input type="password" value={credForm.masterKey} onChange={e => setCredForm(p => ({ ...p, masterKey: e.target.value }))} className="font-mono" placeholder="Sua chave pessoal" />
            </div>
            <Button onClick={handleSaveCredentials} disabled={saveCredentials.isPending} className="w-full">
              Salvar Minhas Credenciais
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Master Key Dialog for Import */}
      <Dialog open={masterKeyOpen} onOpenChange={setMasterKeyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-mono">Chave Mestra para Importação</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground font-mono">
            {pendingImport.reduce((sum, s) => sum + s.hosts.length, 0)} host(s) encontrados em {pendingImport.filter(s => s.subrep).length} pasta(s).
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
          <Input type="password" value={decryptKey} onChange={e => setDecryptKey(e.target.value)} placeholder="Chave mestra" className="font-mono" />
          <Button onClick={() => {
            const host = hosts.find(h => h.id === decryptKeyTarget);
            const creds = host ? getEffectiveCredentials(host) : null;
            if (creds?.encrypted_password) confirmDecrypt(creds.encrypted_password);
          }} className="w-full">
            <Eye className="h-4 w-4 mr-1" /> Revelar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

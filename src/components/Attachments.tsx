import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Paperclip, Upload, Download, Trash2, FileIcon } from 'lucide-react';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

interface Props {
  ticketId: string;
  noteId?: string | null;
  compact?: boolean;
}

export default function Attachments({ ticketId, noteId = null, compact = false }: Props) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const queryKey = ['attachments', ticketId, noteId ?? 'ticket'];

  const { data: items } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from('ticket_attachments')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });
      q = noteId ? q.eq('note_id', noteId) : q.is('note_id', null);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ticketId,
  });

  const uploadFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 10MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${ticketId}/${noteId ?? 'ticket'}/${Date.now()}_${safeName}`;
      const up = await supabase.storage.from('ticket-attachments').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
      });
      if (up.error) throw up.error;
      const { error: insErr } = await supabase.from('ticket_attachments').insert({
        ticket_id: ticketId,
        note_id: noteId,
        uploaded_by: user!.id,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (insErr) {
        await supabase.storage.from('ticket-attachments').remove([path]);
        throw insErr;
      }
      qc.invalidateQueries({ queryKey });
      toast({ title: 'Arquivo enviado!' });
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) await uploadFile(f);
  };

  const download = useMutation({
    mutationFn: async (att: any) => {
      const { data, error } = await supabase.storage
        .from('ticket-attachments')
        .createSignedUrl(att.file_path, 60, { download: att.file_name });
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const removeAtt = useMutation({
    mutationFn: async (att: any) => {
      await supabase.storage.from('ticket-attachments').remove([att.file_path]);
      const { error } = await supabase.from('ticket_attachments').delete().eq('id', att.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast({ title: 'Anexo removido' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-mono text-muted-foreground">
            ANEXOS {items?.length ? `(${items.length})` : ''}
          </span>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 font-mono text-xs"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-3 w-3" />
          {uploading ? 'enviando...' : 'anexar'}
        </Button>
      </div>
      {items && items.length > 0 && (
        <ul className={`space-y-1 ${compact ? '' : 'pt-1'}`}>
          {items.map((att: any) => {
            const canDelete = isAdmin || att.uploaded_by === user?.id;
            return (
              <li
                key={att.id}
                className="flex items-center justify-between gap-2 rounded border border-border bg-muted/30 px-2 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FileIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-mono truncate">{att.file_name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    {formatBytes(att.size_bytes)}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => download.mutate(att)}
                    title="Baixar"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => removeAtt.mutate(att)}
                      title="Remover"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

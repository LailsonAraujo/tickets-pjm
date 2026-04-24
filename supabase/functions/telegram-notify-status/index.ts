const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

const BodySchema = z.object({
  ticket_title: z.string().min(1),
  ticket_id: z.string().uuid(),
  old_status: z.string(),
  new_status: z.string(),
  changed_by_name: z.string().min(1),
  assigned_to_name: z.string().nullable().optional(),
});

const statusEmoji: Record<string, string> = {
  aberto: '🆕',
  em_andamento: '⚙️',
  pausado: '⏸️',
  concluido: '✅',
  cancelado: '❌',
};

const fmt = (s: string) => `${statusEmoji[s] ?? '🔹'} ${s.replace('_', ' ')}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !TELEGRAM_CHAT_ID) {
      throw new Error('Telegram secrets not configured');
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ticket_title, ticket_id, old_status, new_status, changed_by_name, assigned_to_name } = parsed.data;
    const ticketUrl = `${req.headers.get('origin') || 'https://tickets-pjm.lovable.app'}/tickets/${ticket_id}`;

    const message = [
      `🔄 <b>Status do Ticket Alterado</b>`,
      ``,
      `📋 <b>Ticket:</b> ${ticket_title}`,
      `${fmt(old_status)} ➡️ ${fmt(new_status)}`,
      `👤 <b>Responsável:</b> ${assigned_to_name || 'Não atribuído'}`,
      `✏️ <b>Alterado por:</b> ${changed_by_name}`,
      ``,
      `🔗 <a href="${ticketUrl}">Abrir Ticket</a>`,
    ].join('\n');

    const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: Number(TELEGRAM_CHAT_ID),
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Telegram API call failed [${response.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error sending Telegram status notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

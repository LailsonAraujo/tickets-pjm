import { corsHeaders } from '@supabase/supabase-js/cors';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

const BodySchema = z.object({
  ticket_title: z.string().min(1),
  ticket_id: z.string().uuid(),
  assigned_to_name: z.string().nullable().optional(),
  created_by_name: z.string().min(1),
  priority: z.string(),
  category: z.string(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!TELEGRAM_API_KEY) throw new Error('TELEGRAM_API_KEY is not configured');

    const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!TELEGRAM_CHAT_ID) throw new Error('TELEGRAM_CHAT_ID is not configured');

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { ticket_title, ticket_id, assigned_to_name, created_by_name, priority, category } = parsed.data;

    const ticketUrl = `${req.headers.get('origin') || 'https://id-preview--a718164b-d10b-42ee-9900-13580b8de192.lovable.app'}/tickets/${ticket_id}`;

    const assignedLine = assigned_to_name
      ? `👤 <b>Responsável:</b> ${assigned_to_name}`
      : '👤 <b>Responsável:</b> Não atribuído';

    const message = [
      `🎫 <b>Novo Ticket Aberto</b>`,
      ``,
      `📋 <b>Título:</b> ${ticket_title}`,
      `🔥 <b>Prioridade:</b> ${priority}`,
      `📂 <b>Categoria:</b> ${category}`,
      assignedLine,
      `✏️ <b>Criado por:</b> ${created_by_name}`,
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
        chat_id: TELEGRAM_CHAT_ID,
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
    console.error('Error sending Telegram notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

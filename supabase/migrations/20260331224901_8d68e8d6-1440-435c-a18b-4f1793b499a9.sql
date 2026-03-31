
DROP POLICY "Logs insertable by system" ON public.activity_logs;
CREATE POLICY "Logs insertable by authenticated" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

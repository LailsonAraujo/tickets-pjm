
CREATE POLICY "Authenticated can assign unassigned tickets"
ON public.tickets
FOR UPDATE
TO authenticated
USING (assigned_to IS NULL)
WITH CHECK (true);

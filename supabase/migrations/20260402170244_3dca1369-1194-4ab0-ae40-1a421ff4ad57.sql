
ALTER TABLE tickets DROP CONSTRAINT tickets_assigned_to_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE tickets DROP CONSTRAINT tickets_created_by_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ticket_notes DROP CONSTRAINT ticket_notes_author_id_fkey;
ALTER TABLE ticket_notes ADD CONSTRAINT ticket_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE activity_logs DROP CONSTRAINT activity_logs_user_id_fkey;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE tickets ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE ticket_notes ALTER COLUMN author_id DROP NOT NULL;

-- Drafts have no final submission timestamp. Preserve existing final results.
ALTER TABLE mark_entry_batches ALTER COLUMN submitted_at DROP NOT NULL;

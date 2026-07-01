-- Add list_items column to copy_library
-- Part of copy library 4-element structure: headline, mini_copy, list_items, cta
-- list_items stores one item per line (text field, not array)

ALTER TABLE copy_library ADD COLUMN IF NOT EXISTS list_items text;

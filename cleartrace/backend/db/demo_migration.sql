-- Demo mode flag migration
-- Adds is_demo column to companies and marks Verdant Group as a demo account

ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
UPDATE companies SET is_demo = true WHERE name = 'Verdant Group';

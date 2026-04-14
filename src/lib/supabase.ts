// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://kcpeiewfefogpapmpzdu.supabase.co',
  'sb_publishable_pOsFLDAJrRiY71ozvWIJjQ_dl7vHRqQ'
);
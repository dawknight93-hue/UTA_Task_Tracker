import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Task = {
  id: string;
  poc: string;
  contact_method: string;
  task_notes: string;
  status: 'pending' | 'waiting' | 'completed';
  created_at: string;
  completed_at: string | null;
  estimated_minutes: number | null;
  priority: 'high' | 'medium' | 'low' | null;
  due_date: string | null;
};

export type TaskInsert = {
  poc: string;
  contact_method: string;
  task_notes: string;
};

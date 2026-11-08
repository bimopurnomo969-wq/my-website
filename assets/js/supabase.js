import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://ajsqtqxcpnqhjhyphiiw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7bdRFYA7g6mQirAz8mr8Fg_L90CmrSk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

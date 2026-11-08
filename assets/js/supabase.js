/* ChronoStar X — Supabase Client Initialization */

const SUPABASE_URL = 'https://ajsqtqxcpnqhjhyphiiw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7bdRFYA7g6mQirAz8mr8Fg_L90CmrSk';

// Memastikan pustaka supabase tersedia dari CDN di HTML
const { createClient } = supabase;
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

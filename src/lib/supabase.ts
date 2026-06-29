import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cseufbkuvhqrkjrhbvaj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_U4M8BJH04I2yJj3MIp0jFA_8UlSlYlr';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

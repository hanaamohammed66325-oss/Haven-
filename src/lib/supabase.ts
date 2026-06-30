import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cseufbkuvhqrkjrhbvaj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_U4M8BJH04I2yJj3MIp0jFA_8UlSlYlr';

// Canonical production site URL. Used for auth email redirects so confirmation
// links always point at the live site — NEVER window.location.origin, which
// would bake "localhost:3000" into real emails during development.
export const SITE_URL = 'https://havenstudent.com';

// Where confirmation links land: a friendly /welcome page that reads the session
// and forwards to the dashboard (instead of dumping the user on the homepage).
export const WELCOME_URL = 'https://havenstudent.com/welcome';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

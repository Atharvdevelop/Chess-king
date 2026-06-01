import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://evvilodteymztdgbdhgi.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2dmlsb2R0ZXltenRkZ2JkaGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzE3NTUsImV4cCI6MjA5Mjk0Nzc1NX0.2IjuXfxXwhMIkfFmlR8SCi4bEZ_gaR8E0M3XqiXtRm4";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, email');
  console.log("Profiles:", profiles);

  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('*')
    .eq('status', 'pending');
  console.log("Pending games:", games);
}

main().catch(console.error);

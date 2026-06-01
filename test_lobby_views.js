import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://evvilodteymztdgbdhgi.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2dmlsb2R0ZXltenRkZ2JkaGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzE3NTUsImV4cCI6MjA5Mjk0Nzc1NX0.2IjuXfxXwhMIkfFmlR8SCi4bEZ_gaR8E0M3XqiXtRm4";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("Querying lobby_players view...");
  const { data: players, error: plErr } = await supabase.from('lobby_players').select('*');
  console.log("lobby_players view result:", { players, error: plErr });

  console.log("Querying currently_playing view...");
  const { data: matches, error: mErr } = await supabase.from('currently_playing').select('*');
  console.log("currently_playing view result:", { matches, error: mErr });
}

main().catch(console.error);

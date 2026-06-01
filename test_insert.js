import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://evvilodteymztdgbdhgi.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2dmlsb2R0ZXltenRkZ2JkaGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzE3NTUsImV4cCI6MjA5Mjk0Nzc1NX0.2IjuXfxXwhMIkfFmlR8SCi4bEZ_gaR8E0M3XqiXtRm4";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data, error } = await supabase.from('matchmaking_queue').insert({
    player_id: 'd9e03d4c-9a4f-4d6b-826b-1112b5cda803', // dummy uuid
    time_format: '10+0'
  });
  console.log("Insert response:", { data, error });
}

main().catch(console.error);

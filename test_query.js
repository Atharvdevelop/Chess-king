const supabaseUrl = "https://evvilodteymztdgbdhgi.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2dmlsb2R0ZXltenRkZ2JkaGdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzE3NTUsImV4cCI6MjA5Mjk0Nzc1NX0.2IjuXfxXwhMIkfFmlR8SCi4bEZ_gaR8E0M3XqiXtRm4";

async function main() {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });
  const data = await res.json();
  console.log("definitions keys:", Object.keys(data.definitions || {}));
  if (data.definitions && data.definitions.matchmaking_queue) {
    console.log("matchmaking_queue:", data.definitions.matchmaking_queue);
  }
}

main().catch(console.error);

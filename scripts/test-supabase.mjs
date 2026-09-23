import { createClient } from "@supabase/supabase-js";

const url = "https://yvgruznzvdepuyuqzqxf.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Z3J1em56dmRlcHV5dXF6cXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTkzMjgsImV4cCI6MjEwNTE5NTMyOH0.xNKhYN9HwgiCN9y9hURyFkwK7NHtioxizCWQJDUHad0";

const supabase = createClient(url, anonKey);

async function test() {
  console.log("Testing Supabase connection...");
  const { data, error } = await supabase.from("documents").select("*").limit(1);
  if (error) {
    console.log("Supabase response:", error.message, error.code);
  } else {
    console.log("Connection successful! Documents table reachable, count:", data?.length);
  }
}

test();

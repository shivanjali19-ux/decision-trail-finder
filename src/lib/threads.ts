import { supabase } from "@/integrations/supabase/client";

export async function createThread(userId: string) {
  const { data, error } = await supabase.from("chat_threads").insert({ user_id: userId }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function getOrCreateLatestThread(userId: string) {
  const { data } = await supabase.from("chat_threads").select("id").order("updated_at", { ascending: false }).limit(1);
  if (data?.[0]) return data[0].id;
  return createThread(userId);
}

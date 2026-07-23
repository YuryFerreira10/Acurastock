import { supabase } from "./supabaseClient.js";

export async function loadAppData(userId) {
  const { data, error } = await supabase
    .from("app_data")
    .select("items, history")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return { items: data?.items || [], history: data?.history || [] };
}

export async function saveAppData(userId, { items, history }) {
  const { error } = await supabase.from("app_data").upsert({
    user_id: userId,
    items,
    history,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureBucketExistsAdmin(
  supabaseAdmin: SupabaseClient,
  bucket: string
): Promise<void> {
  if (!bucket) return;
  try {
    const { data } = await supabaseAdmin.storage.getBucket(bucket);
    if (!data) {
      await supabaseAdmin.storage.createBucket(bucket, { public: false });
    }
  } catch {
    // ignore
  }
}

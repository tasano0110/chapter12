import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase credentials missing:", {
    url: supabaseUrl,
    hasKey: !!supabaseAnonKey,
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

type UploadOptions = {
  bucket?: string;
  userId?: string;
  objectPath?: string;
  contentType?: string;
  upsert?: boolean;
};

export async function uploadDocument(file: File, options?: UploadOptions) {
  const bucket =
    options?.bucket ||
    process.env.NEXT_PUBLIC_SUPABASE_BUCKET_DOCUMENTS ||
    "document_files";

  let userId = options?.userId;
  if (!userId) {
    const { data: sessionData } = await supabase.auth.getSession();
    userId = sessionData.session?.user?.id || undefined;
  }
  if (!userId && !options?.objectPath) {
    throw new Error("User is not authenticated");
  }

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()
    : undefined;
  const fileName = `${Date.now()}_${uuidv4()}${
    extension ? "." + extension : ""
  }`;
  const objectPath = options?.objectPath || `${userId}/${fileName}`;

  return await supabase.storage.from(bucket).upload(objectPath, file, {
    upsert: options?.upsert ?? false,
    contentType:
      options?.contentType || file.type || "application/octet-stream",
  });
}

export async function getValidAccessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session) return undefined;
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = session.expires_at ?? 0;
  if (exp - nowSec < 30) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) session = refreshed.session;
  }
  return session?.access_token;
}

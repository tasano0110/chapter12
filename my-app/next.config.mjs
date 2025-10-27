const bucketDocuments =
  process.env.NEXT_PUBLIC_SUPABASE_BUCKET_DOCUMENTS ??
  process.env.SUPABASE_BUCKET_DOCUMENTS ??
  "document_files";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_BUCKET_DOCUMENTS: bucketDocuments,
  },
};

export default nextConfig;

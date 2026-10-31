import type { SupabaseClient } from "@supabase/supabase-js";

export type AvatarRecord = {
  id: string;
  avatar_path: string | null;
  avatar_bucket: string | null;
};

export async function signStoragePaths(
  supabase: SupabaseClient,
  bucket: string,
  paths: readonly (string | null)[],
) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!uniquePaths.length) return new Map<string, string>();

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(uniquePaths, 300);
  if (error) throw new Error(`Could not prepare private ${bucket} media: ${error.message}`);

  const signedUrls = new Map<string, string>();
  for (const item of data) {
    if (item.error || !item.path || !item.signedUrl) {
      throw new Error(`Could not prepare private ${bucket} media: ${item.error ?? "No signed URL returned"}`);
    }
    signedUrls.set(item.path, item.signedUrl);
  }
  return signedUrls;
}

export async function signAvatarUrls(
  supabase: SupabaseClient,
  profiles: readonly AvatarRecord[],
) {
  const urls = new Map<string, string>();
  for (const bucket of ["talantalink-profile-media", "talantalink-avatars"]) {
    const records = profiles.filter((profile) => profile.avatar_path && profile.avatar_bucket === bucket);
    const signed = await signStoragePaths(supabase, bucket, records.map((profile) => profile.avatar_path));
    for (const profile of records) {
      const url = signed.get(profile.avatar_path!);
      if (url) urls.set(profile.id, url);
    }
  }
  return urls;
}

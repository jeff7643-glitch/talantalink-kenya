import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signAvatarUrls } from "@/lib/storage/signed-urls";
import ShareButton from "@/app/profile/share-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: post, error } = await supabase.from("posts")
    .select("content")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load post metadata: ${error.message}`);
  if (!post) {
    return { title: "Community post", robots: { index: false, follow: false } };
  }
  const description = post.content.trim().slice(0, 180) || "See what Kenya’s talent community is sharing on TalantaLink.";
  return {
    title: "Community post",
    description,
    openGraph: { title: "Community post | TalantaLink Kenya", description, type: "article" },
    robots: { index: true, follow: true },
  };
}

async function SharedPostContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: post, error: postError } = await supabase.from("posts")
    .select("id,user_id,content,image_url,video_url,created_at")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle();
  if (postError) throw new Error(`Could not load this post: ${postError.message}`);
  if (!post) notFound();

  const [{ data: author, error: authorError }, { count: likes, error: likesError }, { count: comments, error: commentsError }] = await Promise.all([
    supabase.from("profiles").select("id,display_name,headline,avatar_path,avatar_bucket").eq("id", post.user_id).maybeSingle(),
    supabase.from("post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", post.id),
    supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
  ]);
  if (authorError) throw new Error(`Could not load the post author: ${authorError.message}`);
  if (likesError) throw new Error(`Could not load post appreciations: ${likesError.message}`);
  if (commentsError) throw new Error(`Could not load post comments: ${commentsError.message}`);

  const authorAvatarUrl = author
    ? (await signAvatarUrls(supabase, [author])).get(author.id) ?? null
    : null;
  const authorName = author?.display_name ?? "TalantaLink member";
  const initials = authorName.split(/\s+/).slice(0, 2).map((part: string) => part[0]).join("").toUpperCase();
  return (
    <article className="shared-post-card">
      <header className="shared-post-header">
        <Link href={`/talent/${post.user_id}`} className="shared-post-avatar">
          {authorAvatarUrl ? <Image src={authorAvatarUrl} alt="" width={54} height={54} unoptimized /> : <span>{initials}</span>}
        </Link>
        <div><Link href={`/talent/${post.user_id}`}><strong>{authorName}</strong></Link><small>{author?.headline || "TalantaLink community"} · <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}</time></small></div>
        <ShareButton name={`TalantaLink post by ${authorName}`} />
      </header>
      <p className="shared-post-copy">{post.content}</p>
      {post.image_url && <Image className="shared-post-media" src={post.image_url} alt={`Photo shared by ${authorName}`} width={1200} height={900} unoptimized />}
      {post.video_url && <video className="shared-post-media" src={post.video_url} controls preload="metadata" aria-label={`Video shared by ${authorName}`} />}
      <div className="shared-post-stats"><span>{likes ?? 0} appreciations</span><span>{comments ?? 0} comments</span></div>
      <footer><Link className="primary-button" href="/">Join the community <span>→</span></Link></footer>
    </article>
  );
}

export default function SharedPostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="public-profile-page">
      <header className="public-profile-topbar">
        <Link href="/" className="brand-wordmark">talanta<span>link</span><small>HOME OF TALENTS</small></Link>
        <Link className="outline-button" href="/">Explore the community <span>→</span></Link>
      </header>
      <Suspense fallback={<div className="shared-post-card" aria-busy="true" />}>
        <SharedPostContent params={params} />
      </Suspense>
    </main>
  );
}

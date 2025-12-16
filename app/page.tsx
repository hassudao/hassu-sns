"use client"

import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import { User } from "@supabase/supabase-js"
import { timeAgo } from "./lib/time"

type Tweet = {
  id: string
  user_id: string
  user_name: string
  content: string
  image_url: string | null
  likes: number
  created_at: string
}

type Reply = {
  id: string
  tweet_id: string
  parent_reply_id: string | null
  user_id: string
  user_name: string
  content: string
  created_at: string
  likes: number
}

type ReplyTree = Reply & {
  children: ReplyTree[]
}

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [likedTweetIds, setLikedTweetIds] = useState<string[]>([])
  const [likedReplyIds, setLikedReplyIds] = useState<string[]>([])
  const [mode, setMode] = useState<"latest" | "popular">("latest")
  const [text, setText] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [user, setUser] = useState<User | null>(null)

  const [replies, setReplies] = useState<Record<string, ReplyTree[]>>({})
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({})
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({})
  const [replyReplyOpen, setReplyReplyOpen] = useState<Record<string, boolean>>({})
  const [replyReplyText, setReplyReplyText] = useState<Record<string, string>>({})

  // 🔐 ログイン監視
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => listener.subscription.unsubscribe()
  }, [])

  // ツイート取得
  const fetchTweets = async () => {
    const query = supabase.from("tweets").select("*")
    if (mode === "latest") query.order("created_at", { ascending: false })
    else query.order("likes", { ascending: false })
    const { data } = await query
    if (data) {
      setTweets(data)
      data.forEach((t) => fetchReplyCount(t.id))
    }
  }

  // いいね取得
  const fetchMyLikes = async () => {
    if (!user) return
    const { data: tweetLikes } = await supabase.from("likes").select("tweet_id").eq("user_id", user.id).not("tweet_id", "is", null)
    const { data: replyLikes } = await supabase.from("likes").select("reply_id").eq("user_id", user.id).not("reply_id", "is", null)
    setLikedTweetIds(tweetLikes ? tweetLikes.map((l) => l.tweet_id!) : [])
    setLikedReplyIds(replyLikes ? replyLikes.map((l) => l.reply_id!) : [])
  }

  useEffect(() => {
    fetchTweets()
    fetchMyLikes()
  }, [user, mode])

  // 投稿
  const postTweet = async () => {
    if (!user) return alert("ログインしてから投稿してちょ😆")
    if (!text.trim() && !imageFile) return alert("文章か画像は欲しいがね😅")
    setUploading(true)
    let image_url: string | null = null
    if (imageFile) {
      const ext = imageFile.name.split(".").pop()
      const fileName = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from("tweet-images").upload(fileName, imageFile)
      if (error) return alert("画像アップロード失敗💦")
      const { data } = supabase.storage.from("tweet-images").getPublicUrl(fileName)
      image_url = data.publicUrl
    }
    await supabase.from("tweets").insert({ user_id: user.id, user_name: user.email, content: text, image_url })
    setText(""); setImageFile(null); setPreviewUrl(null); setUploading(false)
    fetchTweets()
  }

  // リプ・リプ返信投稿
  const postReply = async (tweetId: string, parentReplyId: string | null = null) => {
    if (!user) return
    const val = parentReplyId ? replyReplyText[parentReplyId] : replyText[tweetId]
    if (!val?.trim()) return
    await supabase.from("replies").insert({ tweet_id: tweetId, parent_reply_id: parentReplyId, user_id: user.id, user_name: user.email, content: val })
    if (parentReplyId) setReplyReplyText((p) => ({ ...p, [parentReplyId]: "" }))
    else setReplyText((p) => ({ ...p, [tweetId]: "" }))
    fetchReplies(tweetId)
    fetchReplyCount(tweetId)
  }

  const deleteReply = async (replyId: string, tweetId: string) => {
    if (!confirm("このリプ消すで😢")) return
    await supabase.from("replies").delete().eq("id", replyId)
    fetchReplies(tweetId)
    fetchReplyCount(tweetId)
  }

  const deleteTweet = async (tweetId: string) => {
    if (!confirm("ほんとに削除する？😢")) return
    await supabase.from("tweets").delete().eq("id", tweetId)
    fetchTweets()
  }

  const fetchReplyCount = async (tweetId: string) => {
    const { count } = await supabase.from("replies").select("*", { count: "exact", head: true }).eq("tweet_id", tweetId)
    setReplyCounts((p) => ({ ...p, [tweetId]: count ?? 0 }))
  }

  const fetchReplies = async (tweetId: string) => {
    const { data } = await supabase.from("replies").select("*").eq("tweet_id", tweetId).order("created_at", { ascending: true })
    if (data) setReplies((p) => ({ ...p, [tweetId]: buildReplyTree(data) }))
  }

  const buildReplyTree = (data: Reply[]): ReplyTree[] => {
    const map: Record<string, ReplyTree> = {}; const roots: ReplyTree[] = []
    data.forEach((r) => map[r.id] = { ...r, children: [] })
    data.forEach((r) => {
      if (r.parent_reply_id && map[r.parent_reply_id]) map[r.parent_reply_id].children.push(map[r.id])
      else roots.push(map[r.id])
    })
    return roots
  }

  // いいね toggle（ツイート）
  const likeTweet = async (tweetId: string) => {
    if (!user) return
    const isLiked = likedTweetIds.includes(tweetId)
    if (isLiked) await supabase.from("likes").delete().eq("user_id", user.id).eq("tweet_id", tweetId)
    else await supabase.from("likes").insert({ user_id: user.id, tweet_id: tweetId })
    fetchMyLikes(); fetchTweets()
  }

  // いいね toggle（リプ・リプ返信）
  const likeReply = async (replyId: string, tweetId: string) => {
    if (!user) return
    const isLiked = likedReplyIds.includes(replyId)
    if (isLiked) await supabase.from("likes").delete().eq("user_id", user.id).eq("reply_id", replyId)
    else await supabase.from("likes").insert({ user_id: user.id, reply_id: replyId })
    fetchMyLikes(); fetchReplies(tweetId)
  }

  const toggleReplyReply = (replyId: string) => setReplyReplyOpen((p) => ({ ...p, [replyId]: !p[replyId] }))

  // ───────────── ReplyNode ─────────────
  const ReplyNode = ({ reply, tweetId, depth = 0 }: { reply: ReplyTree; tweetId: string; depth?: number }) => (
    <div style={{ marginLeft: depth * 16 }} className="mt-1">
      <div className="flex justify-between items-start text-gray-300">
        <div>
          <span className="text-green-400">@{reply.user_name}</span> {reply.content}
          <div className="text-xs text-gray-500">{timeAgo(reply.created_at)}</div>
          <div className="flex gap-2 text-xs text-gray-400 mt-1">
            <button className="hover:text-red-400" onClick={() => likeReply(reply.id, tweetId)}>❤️ {reply.likes}</button>
            {user && <button className="hover:text-blue-400" onClick={() => toggleReplyReply(reply.id)}>💬</button>}
          </div>

          {replyReplyOpen[reply.id] && user && (
            <div className="flex gap-2 mt-1">
              <input
                className="flex-1 bg-black border border-gray-600 rounded px-2 py-1 text-xs"
                placeholder="このリプに返信…"
                value={replyReplyText[reply.id] ?? ""}
                onChange={(e) => setReplyReplyText((p) => ({ ...p, [reply.id]: e.target.value }))}
              />
              <button className="text-blue-400 text-xs" onClick={() => postReply(tweetId, reply.id)}>送信</button>
            </div>
          )}
        </div>

        {user?.id === reply.user_id && <button className="text-red-400 text-xs hover:text-red-500" onClick={() => deleteReply(reply.id, tweetId)}>🗑️</button>}
      </div>

      {reply.children.map((c) => <ReplyNode key={c.id} reply={c} tweetId={tweetId} depth={depth + 1} />)}
    </div>
  )

  return (
    <main className="min-h-screen bg-black text-white">
      <h1 className="text-2xl font-bold p-4 border-b border-gray-700">HASSU SNS 🐦</h1>

      {!user ? (
        <button className="m-4 px-4 py-2 bg-green-500 rounded" onClick={async () => {
          const email = prompt("メールアドレス入力してちょ📧")
          if (!email) return
          await supabase.auth.signInWithOtp({ email })
          alert("メール送ったで📩")
        }}>ログイン</button>
      ) : (
        <div className="m-4 text-sm text-green-400">ログイン中：{user.email}</div>
      )}

      {/* タブ */}
      <div className="flex border-b border-gray-700">
        <button onClick={() => setMode("latest")} className={`flex-1 py-2 ${mode === "latest" ? "border-b-2 border-blue-500 font-bold" : "text-gray-400"}`}>最新</button>
        <button onClick={() => setMode("popular")} className={`flex-1 py-2 ${mode === "popular" ? "border-b-2 border-red-400 font-bold" : "text-gray-400"}`}>おすすめ🔥</button>
      </div>

      {/* 投稿 */}
      <div className="p-4 border-b border-gray-700 space-y-3">
        <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; setImageFile(f); setPreviewUrl(f ? URL.createObjectURL(f) : null) }} />
        {previewUrl && <img src={previewUrl} className="max-h-60 rounded" />}
        <textarea className="w-full bg-black border border-gray-600 p-2 rounded" placeholder="いまどうしとる？" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="px-4 py-2 bg-blue-500 rounded" onClick={postTweet} disabled={uploading}>投稿</button>
      </div>

      {/* TL */}
      <div className="divide-y divide-gray-700">
        {tweets.map((t) => (
          <div key={t.id} className="p-4">
            <div className="flex justify-between">
              <div>@{t.user_name}</div>
              {user?.id === t.user_id && <button onClick={() => deleteTweet(t.id)}>🗑️</button>}
            </div>
            <div className="text-xs text-gray-400">{new Date(t.created_at).toLocaleString()}</div>
            <div className="mt-1">{t.content}</div>
            {t.image_url && <img src={t.image_url} className="mt-2 max-h-60 rounded" />}
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
              <button onClick={() => likeTweet(t.id)} className={likedTweetIds.includes(t.id) ? "text-red-400" : "hover:text-red-400"}>❤️ {t.likes}</button>
              <span className="cursor-pointer hover:text-blue-400" onClick={() => { setOpenReplies((p) => ({ ...p, [t.id]: !p[t.id] })); if (!openReplies[t.id]) fetchReplies(t.id) }}>💬 {replyCounts[t.id] ?? 0}</span>
            </div>

            {openReplies[t.id] && (
              <>
                <div className="ml-4 mt-2 space-y-1 text-sm">
                  {replies[t.id]?.map((r) => <ReplyNode key={r.id} reply={r} tweetId={t.id} />)}
                </div>
                {user && (
                  <div className="ml-4 mt-2 flex gap-2">
                    <input className="flex-1 bg-black border border-gray-600 rounded px-2 py-1 text-sm" placeholder="リプライする…" value={replyText[t.id] ?? ""} onChange={(e) => setReplyText((p) => ({ ...p, [t.id]: e.target.value }))} />
                    <button className="text-blue-400 text-sm" onClick={() => postReply(t.id)}>送信</button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}

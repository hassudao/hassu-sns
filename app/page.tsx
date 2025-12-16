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
  user_name: string
  content: string
  created_at: string
}

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [replies, setReplies] = useState<Record<string, Reply[]>>({})
  const [likedTweetIds, setLikedTweetIds] = useState<string[]>([])
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [openReply, setOpenReply] = useState<string | null>(null)

  const [mode, setMode] = useState<"latest" | "popular">("latest")
  const [text, setText] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [user, setUser] = useState<User | null>(null)

  // 🔐 ログイン
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data } = supabase.auth.onAuthStateChange(
      (_e, s) => setUser(s?.user ?? null)
    )
    return () => data.subscription.unsubscribe()
  }, [])

  // 🐦 TL取得
  const fetchTweets = async () => {
    const q = supabase.from("tweets").select("*")
    mode === "latest"
      ? q.order("created_at", { ascending: false })
      : q.order("likes", { ascending: false })

    const { data } = await q
    if (data) setTweets(data)
  }

  // 💬 リプライ取得
  const fetchReplies = async (tweetId: string) => {
    const { data } = await supabase
      .from("replies")
      .select("*")
      .eq("tweet_id", tweetId)
      .order("created_at")

    if (data) {
      setReplies((prev) => ({ ...prev, [tweetId]: data }))
    }
  }

  // ❤️ いいね
  const fetchMyLikes = async () => {
    if (!user) return setLikedTweetIds([])
    const { data } = await supabase
      .from("likes")
      .select("tweet_id")
      .eq("user_id", user.id)

    if (data) setLikedTweetIds(data.map((l) => l.tweet_id))
  }

  useEffect(() => {
    fetchTweets()
    fetchMyLikes()
  }, [user, mode])

  // ✍️ 投稿
  const postTweet = async () => {
    if (!user) return alert("ログインしてちょ😆")
    if (!text.trim() && !imageFile) return alert("文章か画像いるがね😅")

    setUploading(true)
    let image_url: string | null = null

    if (imageFile) {
      const ext = imageFile.name.split(".").pop()
      const name = `${user.id}/${Date.now()}.${ext}`

      await supabase.storage.from("tweet-images").upload(name, imageFile)
      const { data } = supabase.storage.from("tweet-images").getPublicUrl(name)
      image_url = data.publicUrl
    }

    await supabase.from("tweets").insert({
      user_id: user.id,
      user_name: user.email,
      content: text,
      image_url,
    })

    setText("")
    setImageFile(null)
    setPreviewUrl(null)
    setUploading(false)
    fetchTweets()
  }

  // 💬 リプライ投稿
  const postReply = async (tweetId: string) => {
    if (!user) return alert("ログインしてちょ😆")
    if (!replyText[tweetId]?.trim()) return

    await supabase.from("replies").insert({
      tweet_id: tweetId,
      user_id: user.id,
      user_name: user.email,
      content: replyText[tweetId],
    })

    setReplyText((p) => ({ ...p, [tweetId]: "" }))
    fetchReplies(tweetId)
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <h1 className="text-2xl font-bold p-4 border-b border-gray-700">
        HASSU SNS 🐦
      </h1>

      {/* 投稿 */}
      <div className="p-4 border-b border-gray-700 space-y-3">
        <textarea
          className="w-full bg-black border p-2 rounded"
          placeholder="いまどうしとる？"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button onClick={postTweet} className="bg-blue-500 px-4 py-2 rounded">
          投稿
        </button>
      </div>

      {/* TL */}
      <div className="divide-y divide-gray-700">
        {tweets.map((t) => (
          <div key={t.id} className="p-4">
            <div className="font-bold">@{t.user_name}</div>
            <div className="text-xs text-gray-400">
              {timeAgo(t.created_at)}
            </div>
            <div>{t.content}</div>

            <button
              className="text-blue-400 mt-2"
              onClick={() => {
                setOpenReply(t.id)
                fetchReplies(t.id)
              }}
            >
              💬 リプライ
            </button>

            {openReply === t.id && (
              <div className="mt-3 space-y-2">
                {replies[t.id]?.map((r) => (
                  <div key={r.id} className="text-sm border-l pl-2">
                    <b>@{r.user_name}</b> {r.content}
                  </div>
                ))}

                <input
                  className="w-full bg-black border p-1 rounded"
                  placeholder="返信するで〜"
                  value={replyText[t.id] ?? ""}
                  onChange={(e) =>
                    setReplyText((p) => ({
                      ...p,
                      [t.id]: e.target.value,
                    }))
                  }
                />
                <button
                  onClick={() => postReply(t.id)}
                  className="text-sm bg-green-500 px-2 py-1 rounded"
                >
                  返信
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}

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
  user_id: string
  user_name: string
  content: string
  created_at: string
}

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [replies, setReplies] = useState<Record<string, Reply[]>>({})
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [likedTweetIds, setLikedTweetIds] = useState<string[]>([])
  const [text, setText] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [user, setUser] = useState<User | null>(null)

  // 🔐 ログイン監視
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_e, session) => setUser(session?.user ?? null)
    )
    return () => listener.subscription.unsubscribe()
  }, [])

  // 🐦 ツイート取得
  const fetchTweets = async () => {
    const { data } = await supabase
      .from("tweets")
      .select("*")
      .order("created_at", { ascending: false })
    if (data) setTweets(data)
  }

  // 💬 リプライ取得
  const fetchReplies = async (tweetId: string) => {
    const { data } = await supabase
      .from("replies")
      .select("*")
      .eq("tweet_id", tweetId)
      .order("created_at", { ascending: true })

    if (data) {
      setReplies((prev) => ({ ...prev, [tweetId]: data }))
    }
  }

  // ❤️ いいね取得
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
  }, [user])

  // ✍️ 投稿
  const postTweet = async () => {
    if (!user) return alert("ログインしてちょ😆")
    if (!text.trim() && !imageFile) return alert("何か書いてちょ💦")

    setUploading(true)
    let image_url: string | null = null

    if (imageFile) {
      const ext = imageFile.name.split(".").pop()
      const path = `${user.id}/${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from("tweet-images")
        .upload(path, imageFile)

      if (error) {
        alert("画像失敗だがね😭")
        setUploading(false)
        return
      }

      image_url = supabase.storage
        .from("tweet-images")
        .getPublicUrl(path).data.publicUrl
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
    if (!user) return alert("ログインしてちょ‼️")
    const content = replyText[tweetId]
    if (!content?.trim()) return

    await supabase.from("replies").insert({
      tweet_id: tweetId,
      user_id: user.id,
      user_name: user.email,
      content,
    })

    setReplyText((p) => ({ ...p, [tweetId]: "" }))
    fetchReplies(tweetId)
  }

  // ❤️ いいね
  const likeTweet = async (tweetId: string) => {
    if (!user) return alert("ログインしてちょ❤️")
    const liked = likedTweetIds.includes(tweetId)

    if (liked) {
      await supabase.from("likes").delete()
        .eq("user_id", user.id).eq("tweet_id", tweetId)
      await supabase.rpc("decrement_likes", { tweet_id_input: tweetId })
    } else {
      await supabase.from("likes").insert({
        user_id: user.id,
        tweet_id: tweetId,
      })
      await supabase.rpc("increment_likes", { tweet_id_input: tweetId })
    }

    fetchTweets()
    fetchMyLikes()
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <h1 className="text-2xl font-bold p-4 border-b border-gray-700">
        HASSU SNS 🐦💬
      </h1>

      {/* 投稿 */}
      <div className="p-4 border-b border-gray-700 space-y-2">
        <textarea
          className="w-full bg-black border border-gray-600 p-2 rounded"
          placeholder="いまどうしとる？"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button onClick={postTweet} className="bg-blue-500 px-4 py-2 rounded">
          投稿🔥
        </button>
      </div>

      {/* TL */}
      <div className="divide-y divide-gray-700">
        {tweets.map((t) => (
          <div key={t.id} className="p-4 space-y-2">
            <div className="text-sm">@{t.user_name}</div>
            <div>{t.content}</div>

            <div className="text-xs text-gray-400">
              {timeAgo(t.created_at)}
            </div>

            <button
              onClick={() => likeTweet(t.id)}
              className={likedTweetIds.includes(t.id) ? "text-red-400" : ""}
            >
              ❤️ {t.likes}
            </button>

            {/* 💬 リプライ */}
            <div className="ml-4 mt-2 space-y-1">
              {(replies[t.id] ?? []).map((r) => (
                <div key={r.id} className="text-sm text-gray-300">
                  @{r.user_name}：{r.content}
                </div>
              ))}

              <input
                className="w-full bg-black border border-gray-600 p-1 text-sm rounded"
                placeholder="リプライ書いてちょ💬"
                value={replyText[t.id] ?? ""}
                onChange={(e) =>
                  setReplyText((p) => ({ ...p, [t.id]: e.target.value }))
                }
              />
              <button
                onClick={() => {
                  fetchReplies(t.id)
                  postReply(t.id)
                }}
                className="text-xs text-blue-400"
              >
                返信する💥
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

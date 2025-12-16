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
  parent_id: string | null
}

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [likedTweetIds, setLikedTweetIds] = useState<string[]>([])
  const [mode, setMode] = useState<"latest" | "popular">("latest")

  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<Tweet | null>(null)

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
    const query = supabase.from("tweets").select("*")

    if (mode === "latest") {
      query.order("created_at", { ascending: false })
    } else {
      query.order("likes", { ascending: false })
    }

    const { data } = await query
    if (data) setTweets(data)
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
  }, [user, mode])

  // ✍️ 投稿 & リプライ
  const postTweet = async () => {
    if (!user) return alert("ログインしてちょ😆")
    if (!text.trim()) return alert("文章書いてちょ😅")

    setUploading(true)

    await supabase.from("tweets").insert({
      user_id: user.id,
      user_name: user.email,
      content: text,
      parent_id: replyTo?.id ?? null,
    })

    setText("")
    setReplyTo(null)
    setUploading(false)
    fetchTweets()
  }

  // ❤️ いいね
  const likeTweet = async (tweetId: string) => {
    if (!user) return alert("ログインしてちょ❤️")

    const liked = likedTweetIds.includes(tweetId)

    if (liked) {
      await supabase.from("likes").delete()
        .eq("user_id", user.id)
        .eq("tweet_id", tweetId)

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

  // 🗑️ 削除
  const deleteTweet = async (id: string) => {
    if (!confirm("消すで？😢")) return
    await supabase.from("tweets").delete().eq("id", id)
    fetchTweets()
  }

  // 親ツイだけ
  const parents = tweets.filter((t) => t.parent_id === null)
  const replies = tweets.filter((t) => t.parent_id !== null)

  return (
    <main className="min-h-screen bg-black text-white">
      <h1 className="text-2xl font-bold p-4 border-b border-gray-700">
        HASSU SNS 🐦
      </h1>

      {/* 投稿 */}
      <div className="p-4 border-b border-gray-700 space-y-2">
        {replyTo && (
          <div className="text-xs text-blue-400">
            @{replyTo.user_name} へリプライ中💬
            <button
              onClick={() => setReplyTo(null)}
              className="ml-2 text-red-400"
            >
              ×
            </button>
          </div>
        )}

        <textarea
          className="w-full bg-black border border-gray-600 p-2 rounded"
          placeholder="いまどうしとる？"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <button
          onClick={postTweet}
          disabled={uploading}
          className="px-4 py-2 bg-blue-500 rounded"
        >
          投稿
        </button>
      </div>

      {/* TL */}
      <div className="divide-y divide-gray-700">
        {parents.map((tweet) => (
          <div key={tweet.id} className="p-4">
            <div className="flex justify-between">
              <div>@{tweet.user_name}</div>
              {user?.id === tweet.user_id && (
                <button onClick={() => deleteTweet(tweet.id)}>🗑️</button>
              )}
            </div>

            <div className="text-xs text-gray-400">
              {timeAgo(tweet.created_at)}
            </div>

            <div className="mt-1">{tweet.content}</div>

            <div className="flex gap-4 mt-2 text-sm">
              <button
                onClick={() => likeTweet(tweet.id)}
                className={
                  likedTweetIds.includes(tweet.id)
                    ? "text-red-400"
                    : "text-gray-400"
                }
              >
                ❤️ {tweet.likes}
              </button>

              <button
                onClick={() => setReplyTo(tweet)}
                className="text-blue-400"
              >
                💬 リプライ
              </button>
            </div>

            {/* リプライ表示 */}
            {replies
              .filter((r) => r.parent_id === tweet.id)
              .map((r) => (
                <div
                  key={r.id}
                  className="ml-6 mt-3 p-3 border-l border-gray-600"
                >
                  <div className="text-xs text-gray-400">
                    @{r.user_name}・{timeAgo(r.created_at)}
                  </div>
                  <div>{r.content}</div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </main>
  )
}

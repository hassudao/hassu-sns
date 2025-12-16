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

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [likedTweetIds, setLikedTweetIds] = useState<string[]>([])
  const [text, setText] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)

  // 🔐 ログイン状態監視
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
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

  // ❤️ 自分のいいね一覧取得
  const fetchMyLikes = async () => {
    if (!user) {
      setLikedTweetIds([])
      return
    }

    const { data } = await supabase
      .from("likes")
      .select("tweet_id")
      .eq("user_id", user.id)

    if (data) {
      setLikedTweetIds(data.map((l) => l.tweet_id))
    }
  }

  useEffect(() => {
    fetchTweets()
    fetchMyLikes()
  }, [user])

  // ✍️ 投稿
  const postTweet = async () => {
    if (!user) return alert("ログインしてから投稿してちょ！😆")
    if (!text.trim() && !imageFile) {
      alert("文章か画像、どっちかは欲しいで！😅")
      return
    }

    setUploading(true)
    let image_url: string | null = null

    if (imageFile) {
      if (imageFile.size > 3 * 1024 * 1024) {
        alert("画像は3MBまでだで！📸")
        setUploading(false)
        return
      }

      const ext = imageFile.name.split(".").pop()
      const fileName = `${user.id}/${Date.now()}.${ext}`

      const { error } = await supabase.storage
        .from("tweet-images")
        .upload(fileName, imageFile)

      if (error) {
        console.error(error)
        setUploadError("画像アップロード失敗したがね💦")
        setUploading(false)
        return
      }

      const { data } = supabase.storage
        .from("tweet-images")
        .getPublicUrl(fileName)

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
    setUploadError(null)
    setUploading(false)
    fetchTweets()
  }

  // ❤️ いいね ON / OFF
  const likeTweet = async (tweetId: string) => {
    if (!user) return alert("ログインしてからいいねしてちょ❤️")

    const isLiked = likedTweetIds.includes(tweetId)

    if (isLiked) {
      await supabase
        .from("likes")
        .delete()
        .eq("user_id", user.id)
        .eq("tweet_id", tweetId)

      await supabase.rpc("decrement_likes", {
        tweet_id_input: tweetId,
      })
    } else {
      await supabase.from("likes").insert({
        user_id: user.id,
        tweet_id: tweetId,
      })

      await supabase.rpc("increment_likes", {
        tweet_id_input: tweetId,
      })
    }

    fetchTweets()
    fetchMyLikes()
  }

  // 🗑️ 削除
  const deleteTweet = async (tweetId: string) => {
    if (!confirm("ほんとに削除する？😢")) return

    await supabase.from("tweets").delete().eq("id", tweetId)
    fetchTweets()
  }

  // 🧹 プレビューURL解放
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  return (
    <main className="min-h-screen bg-black text-white">
      <h1 className="text-2xl font-bold p-4 border-b border-gray-700">
        HASSU SNS 🐦
      </h1>

      {!user ? (
        <button
          onClick={async () => {
            const email = prompt("メールアドレス入力してちょ📧")
            if (!email) return
            await supabase.auth.signInWithOtp({ email })
            alert("メール送ったで！📩")
          }}
          className="m-4 px-4 py-2 bg-green-500 rounded"
        >
          ログイン
        </button>
      ) : (
        <div className="m-4 text-sm text-green-400">
          ログイン中：{user.email}
        </div>
      )}

      {/* 投稿 */}
      <div className="p-4 border-b border-gray-700 space-y-3">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            setImageFile(file)
            setPreviewUrl(file ? URL.createObjectURL(file) : null)
          }}
        />

        {previewUrl && (
          <img src={previewUrl} className="max-h-60 rounded" />
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
  {tweets.map((tweet) => (
    <div key={tweet.id} className="p-4">
      <div className="flex justify-between">
        <div>@{tweet.user_name}</div>
        {user?.id === tweet.user_id && (
          <button onClick={() => deleteTweet(tweet.id)}>🗑️</button>
        )}
      </div>

      {/* 🕒 ここ追加！！！ */}
      <div className="text-xs text-gray-400">
        {tweet.created_at
          ? new Date(tweet.created_at).toLocaleString()
          : "時刻取得中…"}
      </div>

      <div className="mt-1">{tweet.content}</div>

      {tweet.image_url && (
        <img src={tweet.image_url} className="mt-2 max-h-60 rounded" />
      )}

<div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
  <button
    onClick={() => likeTweet(tweet.id)}
    className={
      likedTweetIds.includes(tweet.id)
        ? "text-red-400"
        : "hover:text-red-400"
    }
  >
    ❤️ {tweet.likes}
  </button>

  <span>・{timeAgo(tweet.created_at)}</span>
</div>

    </div>
  ))}
</div>
    </main>
  )
}

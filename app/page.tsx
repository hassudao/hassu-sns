"use client"

import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"
import { User } from "@supabase/supabase-js"

type Tweet = {
  id: string
  user_name: string
  content: string
  image_url: string | null
  likes: number
  created_at: string
}

export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([])
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

  useEffect(() => {
    fetchTweets()
  }, [])

  // ✍️ 投稿処理
  const postTweet = async () => {
    if (!user) return alert("ログインしてから投稿してちょ！😆")
    if (!text.trim() && !imageFile) {
      alert("文章か画像、どっちかは欲しいで！😅")
      return
    }

    setUploading(true)
    let image_url: string | null = null

    // 📸 画像アップロード
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

    // 🐦 DBに投稿
    const { error } = await supabase.from("tweets").insert({
      user_name: user.email,
      content: text,
      image_url,
    })

    if (error) {
      console.error(error)
      alert("投稿失敗したで💦")
    }

    // ♻️ リセット
    setText("")
    setImageFile(null)
    setPreviewUrl(null)
    setUploadError(null)
    setUploading(false)
    fetchTweets()
  }

  // ❤️ いいね
  const likeTweet = async (tweetId: string) => {
    if (!user) return alert("ログインしてからいいねしてちょ❤️")

    const { error } = await supabase.from("likes").insert({
      user_id: user.id,
      tweet_id: tweetId,
    })

    if (error) {
      alert("もういいねしとるで！😆")
      return
    }

    await supabase.rpc("increment_likes", {
      tweet_id_input: tweetId,
    })

    fetchTweets()
  }

  // 🧹 プレビューURL解放（地味に超大事）
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

      {/* 🔐 ログイン */}
      {!user ? (
        <button
          onClick={async () => {
            const email = prompt("メールアドレス入力してちょ📧")
            if (!email) return
            await supabase.auth.signInWithOtp({ email })
            alert("メール送ったで！📩（Vercelで確認な！）")
          }}
          className="m-4 px-4 py-2 bg-green-500 rounded"
        >
          ログイン
        </button>
      ) : (
        <div className="m-4 text-sm text-green-400">
          ログイン中：{user.email}
          <button
            onClick={() => supabase.auth.signOut()}
            className="ml-4 underline"
          >
            ログアウト
          </button>
        </div>
      )}

      {/* ✍️ 投稿フォーム */}
      <div className="p-4 border-b border-gray-700 space-y-3">
        <label className="block text-sm font-bold">
          📸 画像投稿（任意）
        </label>

        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null
            setImageFile(file)
            setPreviewUrl(file ? URL.createObjectURL(file) : null)
          }}
          className="block w-full text-sm text-gray-300
                     file:mr-4 file:py-2 file:px-4
                     file:rounded file:border-0
                     file:bg-blue-600 file:text-white
                     hover:file:bg-blue-700"
        />

        {previewUrl && (
          <img
            src={previewUrl}
            className="mt-3 max-h-60 rounded border border-gray-600"
          />
        )}

        {uploadError && (
          <div className="text-red-400 text-sm">{uploadError}</div>
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
          className="px-4 py-2 bg-blue-500 rounded disabled:opacity-50"
        >
          {uploading ? "アップロード中…⏳" : "投稿"}
        </button>
      </div>

      {/* 📰 タイムライン */}
      <div className="divide-y divide-gray-700">
        {tweets.map((tweet) => (
          <div key={tweet.id} className="p-4">
            <div className="font-semibold">@{tweet.user_name}</div>
            <div className="my-2">{tweet.content}</div>

            {tweet.image_url && (
              <img
                src={tweet.image_url}
                className="mt-2 rounded max-h-60 w-full object-contain"
              />
            )}

            <div className="text-sm text-gray-400">
              {new Date(tweet.created_at).toLocaleString()}
            </div>

            <button
              onClick={() => likeTweet(tweet.id)}
              className="mt-2 text-sm hover:text-red-400"
            >
              ❤️ {tweet.likes}
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}

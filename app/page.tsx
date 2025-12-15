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
  const [imageUrl, setImageUrl] = useState("")
  const [user, setUser] = useState<User | null>(null)

  // 🔐 ログイン状態監視
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
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

  // ✍️ 投稿
  const postTweet = async () => {
    if (!user) {
      alert("ログインしてから投稿してちょ😆")
      return
    }
    if (!text.trim()) return

    const { error } = await supabase.from("tweets").insert({
      user_name: user.email,
      content: text,
      image_url: imageUrl || null,
    })

    if (error) {
      alert("投稿失敗したで💦")
      return
    }

    setText("")
    setImageUrl("")
    fetchTweets()
  }

  // ❤️ いいね（1人1回制御🔥）
  const likeTweet = async (tweetId: string) => {
    if (!user) return alert("ログインしてちょ❤️")

    // ① likes テーブルに追加
    const { error } = await supabase.from("likes").insert({
      user_id: user.id,
      tweet_id: tweetId,
    })

    if (error) {
      alert("もういいねしとるで！😆")
      return
    }

    // ② tweets.likes を +1
    await supabase.rpc("increment_likes", {
      tweet_id_input: tweetId,
    })

    fetchTweets()
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <h1 className="text-2xl font-bold p-4 border-b border-gray-700">
        HASSU SNS 🐦
      </h1>

      {/* 🔐 ログインUI */}
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
          <button
            onClick={() => supabase.auth.signOut()}
            className="ml-4 underline"
          >
            ログアウト
          </button>
        </div>
      )}

      {/* ✍️ 投稿フォーム */}
      <div className="p-4 border-b border-gray-700">
        <input
          className="w-full mb-2 bg-black border border-gray-600 p-2 rounded"
          placeholder="画像URL（任意）"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />

        <textarea
          className="w-full bg-black border border-gray-600 p-2 rounded"
          placeholder="いまどうしとる？"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <button
          onClick={postTweet}
          className="mt-2 px-4 py-2 bg-blue-500 rounded"
        >
          投稿
        </button>
      </div>

      {/* 📰 タイムライン */}
      <div className="divide-y divide-gray-700">
        {tweets.map((tweet) => (
          <div key={tweet.id} className="p-4">
            <div className="font-semibold">@{tweet.user_name}</div>
            <div className="my-2">{tweet.content}</div>

            {tweet.image_url && (
              <img src={tweet.image_url} className="mt-2 rounded max-h-60" />
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

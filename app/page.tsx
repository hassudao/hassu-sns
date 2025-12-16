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
  parent_reply_id: string | null  // 親リプID
  user_id: string
  user_name: string
  content: string
  created_at: string
  likes: number
}
type ReplyTree = Reply & {
  children: ReplyTree[]
}

const [replies, setReplies] = useState<Record<string, ReplyTree[]>>({})




export default function Home() {
  const [tweets, setTweets] = useState<Tweet[]>([])
  const [likedTweetIds, setLikedTweetIds] = useState<string[]>([])
  const [mode, setMode] = useState<"latest" | "popular">("latest")
  const [text, setText] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [replies, setReplies] = useState<Record<string, Reply[]>>({})
　const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({})
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({})
  const [replyReplyOpen, setReplyReplyOpen] = useState<Record<string, boolean>>({})
　const [replyReplyText, setReplyReplyText] = useState<Record<string, string>>({})





  // 🔐 ログイン状態監視
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  // 🐦 ツイート取得（最新 / おすすめ）
  const fetchTweets = async () => {
  const query = supabase.from("tweets").select("*")

  if (mode === "latest") {
    query.order("created_at", { ascending: false })
  } else {
    query.order("likes", { ascending: false })
  }

  const { data } = await query

  if (data) {
    setTweets(data)
    data.forEach((tweet) => fetchReplyCount(tweet.id))
  }
}


  // ❤️ 自分のいいね一覧
  const fetchMyLikes = async () => {
    if (!user) {
      setLikedTweetIds([])
      return
    }

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
    if (!user) return alert("ログインしてから投稿してちょ😆")
    if (!text.trim() && !imageFile) return alert("文章か画像は欲しいがね😅")

    setUploading(true)
    let image_url: string | null = null

    if (imageFile) {
      if (imageFile.size > 3 * 1024 * 1024) {
        alert("画像は3MBまでだで📸")
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
        setUploadError("画像アップロード失敗だがね💦")
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
  // ✍️ リプライ投稿
const postReply = async (tweetId: string) => {
  if (!user) return alert("ログインしてちょ😆")
  if (!replyText[tweetId]?.trim()) return

  await supabase.from("replies").insert({
    tweet_id: tweetId,
    user_id: user.id,
    user_name: user.email,
    content: replyText[tweetId],
  })

  setReplyText((prev) => ({ ...prev, [tweetId]: "" }))
  fetchReplies(tweetId)

}
  // 🗑️ リプライ削除
const deleteReply = async (replyId: string, tweetId: string) => {
  if (!confirm("このリプ消すでええ？😢")) return

  await supabase
    .from("replies")
    .delete()
    .eq("id", replyId)

  // 再取得
  fetchReplies(tweetId)
  fetchReplyCount(tweetId)
}

  // 💬 リプライ数取得
const fetchReplyCount = async (tweetId: string) => {
  const { count } = await supabase
    .from("replies")
    .select("*", { count: "exact", head: true })
    .eq("tweet_id", tweetId)

  setReplyCounts((prev) => ({
    ...prev,
    [tweetId]: count ?? 0,
  }))
}



  // ❤️ いいねON/OFF
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
  // 💬 リプライ取得
const fetchReplies = async (tweetId: string) => {
  const { data } = await supabase
    .from("replies")
    .select("*")
    .eq("tweet_id", tweetId)
    .order("created_at", { ascending: true })

  if (data) {
    setReplies((prev) => ({
      ...prev,
      [tweetId]: buildReplyTree(data), // ←ここで必ずReplyTree[]に変換
    }))
  }
}





  // 親リプごとに階層化
const buildReplyTree = (replies: Reply[]): ReplyTree[] => {
  const map: Record<string, ReplyTree> = {}
  const roots: ReplyTree[] = []

  replies.forEach((r) => {
    map[r.id] = { ...r, children: [] } // childrenを必ず初期化
  })

  replies.forEach((r) => {
    if (r.parent_reply_id && map[r.parent_reply_id]) {
      map[r.parent_reply_id].children.push(map[r.id])
    } else {
      roots.push(map[r.id])
    }
  })

  return roots
}



type ReplyTree = Reply & { children: ReplyTree[] }

  const ReplyNode = ({
  reply,
  tweetId,
  depth = 0,
}: {
  reply: ReplyTree
  tweetId: string
  depth?: number
}) => {
  return (
    <div className="ml-4" style={{ marginLeft: depth * 16 }}>
      <div className="flex justify-between items-start text-gray-300">
        <div>
          <span className="text-green-400">@{reply.user_name}</span> {reply.content}
          <div className="text-xs text-gray-500">{timeAgo(reply.created_at)}</div>
          <div className="flex gap-2 text-xs text-gray-400 mt-1">
            <button
              onClick={() => likeReply(reply.id)}
              className="hover:text-red-400"
            >
              ❤️ {reply.likes ?? 0}
            </button>
            {user && (
              <button
                onClick={() => toggleReplyReply(reply.id)}
                className="hover:text-blue-400"
              >
                💬
              </button>
            )}
          </div>

          {/* リプへの返信入力 */}
          {replyReplyOpen[reply.id] && user && (
            <div className="flex gap-2 mt-1">
              <input
                className="flex-1 bg-black border border-gray-600 rounded px-2 py-1 text-xs"
                placeholder="このリプに返信…"
                value={replyReplyText[reply.id] ?? ""}
                onChange={(e) =>
                  setReplyReplyText((prev) => ({
                    ...prev,
                    [reply.id]: e.target.value,
                  }))
                }
              />
              <button
                onClick={() => postReplyToReply(tweetId, reply.id)}
                className="text-blue-400 text-xs"
              >
                送信
              </button>
            </div>
          )}
        </div>

        {/* 自分のリプだけ削除可 */}
        {user?.id === reply.user_id && (
          <button
            onClick={() => deleteReply(reply.id, tweetId)}
            className="text-red-400 text-xs hover:text-red-500"
          >
            🗑️
          </button>
        )}
      </div>

      {/* 子リプを再帰的に描画 */}
      {reply.children.map((child) => (
        <ReplyNode key={child.id} reply={child} tweetId={tweetId} depth={depth + 1} />
      ))}
    </div>
  )
}

  


  // 🗑️ 削除
  const deleteTweet = async (tweetId: string) => {
    if (!confirm("ほんとに削除する？😢")) return
    await supabase.from("tweets").delete().eq("id", tweetId)
    fetchTweets()
  }

  const likeReply = async (replyId: string) => {
  if (!user) return

  await supabase.rpc("increment_reply_likes", {
    reply_id_input: replyId,
  })

  Object.keys(openReplies).forEach((tweetId) => {
    if (openReplies[tweetId]) fetchReplies(tweetId)
  })
}
const toggleReplyReply = (replyId: string) => {
  setReplyReplyOpen((prev) => ({
    ...prev,
    [replyId]: !prev[replyId],
  }))
}
const postReplyToReply = async (
  tweetId: string,
  parentReplyId: string
) => {
  if (!user) return
  if (!replyReplyText[parentReplyId]?.trim()) return

  await supabase.from("replies").insert({
    tweet_id: tweetId,
    parent_reply_id: parentReplyId,
    user_id: user.id,
    user_name: user.email,
    content: replyReplyText[parentReplyId],
  })

  setReplyReplyText((prev) => ({
    ...prev,
    [parentReplyId]: "",
  }))

  fetchReplies(tweetId)
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
            alert("メール送ったで📩")
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

      {/* タブ */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setMode("latest")}
          className={`flex-1 py-2 ${
            mode === "latest"
              ? "border-b-2 border-blue-500 font-bold"
              : "text-gray-400"
          }`}
        >
          最新
        </button>
        <button
          onClick={() => setMode("popular")}
          className={`flex-1 py-2 ${
            mode === "popular"
              ? "border-b-2 border-red-400 font-bold"
              : "text-gray-400"
          }`}
        >
          おすすめ🔥
        </button>
      </div>

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

        {previewUrl && <img src={previewUrl} className="max-h-60 rounded" />}

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

            <div className="text-xs text-gray-400">
              {new Date(tweet.created_at).toLocaleString()}
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

<span
  className="cursor-pointer hover:text-blue-400"
  onClick={() => {
    // 開閉トグル
    setOpenReplies((prev) => ({
      ...prev,
      [tweet.id]: !prev[tweet.id],
    }))

    // 💬 開くときだけリプライ取得
    if (!openReplies[tweet.id]) {
      fetchReplies(tweet.id)
    }
  }}
>
  💬 {replyCounts[tweet.id] ?? 0}
</span>


</div>

{openReplies[tweet.id] && (
  <>
    <div className="ml-4 mt-2 space-y-1 text-sm">
      {replies[tweet.id]?.map((reply) => (
        <ReplyNode key={reply.id} reply={reply} tweetId={tweet.id} />
      ))}
    </div>
    {/* 投稿用入力 */}
    {user && (
      <div className="ml-4 mt-2 flex gap-2">
        <input
          className="flex-1 bg-black border border-gray-600 rounded px-2 py-1 text-sm"
          placeholder="リプライする…"
          value={replyText[tweet.id] ?? ""}
          onChange={(e) =>
            setReplyText((prev) => ({ ...prev, [tweet.id]: e.target.value }))
          }
        />
        <button
          onClick={() => postReply(tweet.id)}
          className="text-blue-400 text-sm"
        >
          送信
        </button>
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

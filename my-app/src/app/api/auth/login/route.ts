// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// フロントでも使う公開キー（Anon Key）を使用します
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as LoginBody;

    // 入力チェック（最低限）
    if (!email || !password) {
      return NextResponse.json(
        { message: "email と password を送ってください。" },
        { status: 400 }
      );
    }

    // Supabaseクライアント（サーバー側）を作成
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // パスワード方式でサインイン
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // 認証失敗
      return NextResponse.json(
        {
          message: "メールアドレスまたはパスワードが正しくありません。",
          detail: error.message,
        },
        { status: 401 }
      );
    }

    // ここで得られる data.session に access_token / refresh_token が含まれます
    // 今回の最小構成では、フロントがこのトークンで後続APIを叩く想定です
    // （例：Authorization: Bearer <access_token>）
    return NextResponse.json(
      {
        user: data.user,
        session: data.session, // access_token / refresh_token を含む
      },
      { status: 200 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { message: "サーバーエラーが発生しました。" },
      { status: 500 }
    );
  }
}

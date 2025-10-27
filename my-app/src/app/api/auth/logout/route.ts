// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: Request) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // アクセストークンをヘッダーから取得
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return NextResponse.json(
        { message: "Authorization ヘッダーが必要です。" },
        { status: 401 }
      );
    }

    // セッションを復元してからサインアウト
    supabase.auth.setSession({
      access_token: token,
      refresh_token: "", // refresh_token は不要でもOK
    });

    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json(
        { message: "ログアウトに失敗しました。", detail: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: "ログアウトしました。" },
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

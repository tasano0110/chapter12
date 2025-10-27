// app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type SignupBody = {
  email?: string;
  password?: string;
};

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as SignupBody;

    if (!email || !password) {
      return NextResponse.json(
        { message: "email と password を送ってください。" },
        { status: 400 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 新規ユーザー登録
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { message: "サインアップに失敗しました。", detail: error.message },
        { status: 400 }
      );
    }

    // メール確認を有効にしている場合、ここで確認メールが送信される
    return NextResponse.json(
      {
        user: data.user,
        session: data.session, // メール確認必須の設定なら null になる場合あり
        message: "サインアップ成功。必要ならメールを確認してください。",
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

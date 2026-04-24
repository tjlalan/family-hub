import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !appUrl ||
    !supabaseUrl ||
    !supabaseServiceRoleKey
  ) {
    return NextResponse.json(
      { error: "Missing required environment variables." },
      { status: 500 }
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/?google_calendar_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/?google_calendar_error=${encodeURIComponent("missing_code")}`
    );
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    return NextResponse.json(
      { error: "Failed to exchange code for tokens.", details: errorText },
      { status: 500 }
    );
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token ?? null;
  const expiryDate = Date.now() + tokenData.expires_in * 1000;
  const scope = tokenData.scope ?? null;

  const googleUserResponse = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  let googleEmail: string | null = null;

  if (googleUserResponse.ok) {
    const googleUser = (await googleUserResponse.json()) as { email?: string };
    googleEmail = googleUser.email ?? null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { error: upsertError } = await supabase
    .from("google_calendar_connection")
    .upsert({
      id: "shared-family-calendar",
      google_email: googleEmail,
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiryDate,
      scope,
    });

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to save Google tokens.", details: upsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.redirect(
    `${appUrl}/?google_calendar_connected=true`
  );
}
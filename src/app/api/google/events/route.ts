import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type GoogleTokenRow = {
  id: string;
  google_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null;
  scope: string | null;
};

async function refreshAccessTokenIfNeeded(row: GoogleTokenRow) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  if (!row.refresh_token) {
    throw new Error("Missing refresh token");
  }

  const expiresAt = row.expiry_date ?? 0;
  const now = Date.now();

  // Refresh if expired or about to expire in the next minute
  if (expiresAt > now + 60_000 && row.access_token) {
    return {
      accessToken: row.access_token,
      expiryDate: expiresAt,
      refreshed: false,
    };
  }

  const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    throw new Error(`Failed to refresh access token: ${errorText}`);
  }

  const refreshData = (await refreshResponse.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
  };

  return {
    accessToken: refreshData.access_token,
    expiryDate: Date.now() + refreshData.expires_in * 1000,
    refreshed: true,
  };
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  const timeMin = request.nextUrl.searchParams.get("timeMin");
  const timeMax = request.nextUrl.searchParams.get("timeMax");

  if (!timeMin || !timeMax) {
    return NextResponse.json(
      { error: "Missing timeMin or timeMax" },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: row, error: rowError } = await supabase
    .from("google_calendar_connection")
    .select("*")
    .eq("id", "shared-family-calendar")
    .single<GoogleTokenRow>();

  if (rowError || !row) {
    return NextResponse.json(
      { error: "Google Calendar is not connected yet." },
      { status: 404 }
    );
  }

  try {
    const tokenResult = await refreshAccessTokenIfNeeded(row);

    if (tokenResult.refreshed) {
      const { error: updateError } = await supabase
        .from("google_calendar_connection")
        .update({
          access_token: tokenResult.accessToken,
          expiry_date: tokenResult.expiryDate,
        })
        .eq("id", "shared-family-calendar");

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to persist refreshed access token.", details: updateError.message },
          { status: 500 }
        );
      }
    }

    const googleParams = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    const googleResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${googleParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
        },
      }
    );

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      return NextResponse.json(
        { error: "Failed to fetch Google Calendar events.", details: errorText },
        { status: 500 }
      );
    }

    const googleData = await googleResponse.json();

    return NextResponse.json(googleData);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error fetching calendar events.",
      },
      { status: 500 }
    );
  }
}
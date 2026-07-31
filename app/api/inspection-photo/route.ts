import { NextRequest, NextResponse } from "next/server";

const expectedBucket = "bright-learners-academy-app.firebasestorage.app";
const allowedHosts = new Set(["firebasestorage.googleapis.com", "storage.googleapis.com"]);

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url");
  if (!source) return NextResponse.json({ error: "Missing photo URL." }, { status: 400 });

  let photoUrl: URL;
  try {
    photoUrl = new URL(source);
  } catch {
    return NextResponse.json({ error: "Invalid photo URL." }, { status: 400 });
  }

  const permitted = photoUrl.protocol === "https:"
    && allowedHosts.has(photoUrl.hostname)
    && photoUrl.pathname.includes(expectedBucket);
  if (!permitted) return NextResponse.json({ error: "Photo source is not permitted." }, { status: 403 });

  const response = await fetch(photoUrl, { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json({ error: "Photo could not be loaded." }, { status: response.status });
  }

  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      "Content-Type": response.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

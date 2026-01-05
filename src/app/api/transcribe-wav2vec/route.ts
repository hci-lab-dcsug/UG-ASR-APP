import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const requestedLanguage = searchParams.get("language") ?? "akan";
    const language = requestedLanguage.toLowerCase() === "ewe" ? "ewe" : "akan";

    const form = await req.formData();
    const maybeFile = form.get("file");

    if (!(maybeFile instanceof Blob)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // File has .name; Blob does not - narrow safely.
    const filename = maybeFile instanceof File ? maybeFile.name : "audio";

    const forward = new FormData();
    forward.append("file", maybeFile, filename);
    forward.append("language", language);

    const upstreamUrl = "https://wav2vec-service-194975005212.europe-west4.run.app/transcribe";

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      body: forward,
      headers: { Accept: "application/json" },
    });

    const text = await upstream.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: upstream.status });
    } catch {
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
        },
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message ?? "Server error" }, { status: 500 });
  }
}

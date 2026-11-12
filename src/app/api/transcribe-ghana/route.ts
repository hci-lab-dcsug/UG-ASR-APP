import { NextRequest, NextResponse } from "next/server";

const GHANA_ASR_URL =
  "https://ghana-asr-194975005212.us-central1.run.app/transcribe";

const SUPPORTED_LANGUAGES: Record<string, string> = {
  dagaare: "Dagaare",
  dagbani: "Dagbani",
  ewe: "Ewe",
  ga: "Ga",
  ikposo: "Ikposo",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const maybeFile = form.get("file");
    const formLanguage = form.get("language");
    const requestedLanguage =
      typeof formLanguage === "string" && formLanguage.trim()
        ? formLanguage
        : new URL(req.url).searchParams.get("language") ?? "";
    const language = SUPPORTED_LANGUAGES[requestedLanguage.trim().toLowerCase()];

    if (!(maybeFile instanceof Blob)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!language) {
      return NextResponse.json(
        { error: "Unsupported language for the Ghana multilingual ASR service" },
        { status: 400 }
      );
    }

    const filename = maybeFile instanceof File ? maybeFile.name : "audio";
    const forward = new FormData();
    forward.append("file", maybeFile, filename);
    forward.append("language", language);

    const upstream = await fetch(GHANA_ASR_URL, {
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
          "content-type":
            upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
        },
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message || "Server error" }, { status: 500 });
  }
}

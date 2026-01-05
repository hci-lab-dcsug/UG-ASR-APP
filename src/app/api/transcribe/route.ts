import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const fallbackLanguage = searchParams.get("language") ?? "akan";

    const form = await req.formData();
    const maybeFile = form.get("file");
    const formLanguage = form.get("language");
    const formIsImpaired = form.get("isImpaired");
    const formEtiology = form.get("etiology");

    const language =
      typeof formLanguage === "string" && formLanguage.trim()
        ? formLanguage
        : fallbackLanguage;
    const isImpaired =
      typeof formIsImpaired === "string" && formIsImpaired.trim()
        ? ["true", "1", "yes"].includes(formIsImpaired.trim().toLowerCase())
          ? "true"
          : "false"
        : null;
    const etiology =
      typeof formEtiology === "string" && formEtiology.trim()
        ? formEtiology
        : null;

    if (!(maybeFile instanceof Blob)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // Narrow filename safely: File has .name; Blob doesn't
    const filename = maybeFile instanceof File ? maybeFile.name : "audio";

    const forward = new FormData();
    forward.append("file", maybeFile, filename);
    forward.append("language", language);
    if (isImpaired !== null) {
      forward.append("isImpaired", isImpaired);
    }
    if (etiology) forward.append("etiology", etiology);

    const upstream = await fetch(
      "https://whisper-service-194975005212.europe-west4.run.app/transcribe",
      {
        method: "POST",
        body: forward,
        headers: { Accept: "application/json" },
      }
    );

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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message ?? "Server error" }, { status: 500 });
  }
}

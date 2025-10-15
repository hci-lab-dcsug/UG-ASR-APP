import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const model =
      searchParams.get("model_used") ?? "wav2vec2-bert-akan-ugspeechdata-v2";

    const form = await req.formData();
    const maybeFile = form.get("file");

    if (!(maybeFile instanceof Blob)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // File has .name; Blob does not—narrow safely.
    const filename = maybeFile instanceof File ? maybeFile.name : "audio";

    const forward = new FormData();
    forward.append("file", maybeFile, filename);

    const upstream = await fetch(
      `https://hcidcsug--ugtts-wav2vec-akan-api.modal.run/transcribe?model_used=${encodeURIComponent(
        model
      )}`,
      { method: "POST", body: forward, headers: { Accept: "application/json" } }
    );
    console.log(model);

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

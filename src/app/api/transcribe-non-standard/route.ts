import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const model = searchParams.get("model_name") ?? "gen-lg";

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // Forward the original file as-is (field name must be "file")
    const forward = new FormData();
    forward.append("file", file, (file as any).name ?? "audio");

    // ✅ Use the production endpoint (no -dev), and keep /transcribe path
    const upstream = await fetch(
      `https://hcidcsug--ugtts-faster-whisper-akan-nss-api.modal.run/transcribe?model_name=${encodeURIComponent(model)}`,
      { method: "POST", body: forward, headers: { Accept: "application/json" } }
    );
    console.log(model)

    const text = await upstream.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: upstream.status });
    } catch {
      return new NextResponse(text, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8" },
      });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

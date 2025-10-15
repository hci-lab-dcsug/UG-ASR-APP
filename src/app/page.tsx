"use client";
import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";


export default function Page() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [model, setModel] = useState("whisper"); // "whisper" | "wav2vec"
  const [transcription, setTranscription] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [language, setLanguage] = useState("akan");
  const [isImpaired, setIsImpaired] = useState("false");
  const [etiology, setEtiology] = useState("");
  const [error, setError] = useState("");
  const [canSubmit, setCanSubmit] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingAvailable, setRecordingAvailable] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const revokeOldUrl = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl("");
    }
  };

  const stopPlaybackAndReset = () => {
    if (wavesurfer.current) {
      try { wavesurfer.current.stop(); } catch {}
      setIsPlaying(false);
    }
    setCurrentTime(0);
    setDuration(0);
  };

  const isSilentAudio = async (file: File, silenceThreshold = 0.001) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      let sum = 0; for (let i = 0; i < channelData.length; i++) sum += Math.abs(channelData[i]);
      const average = sum / channelData.length; return average < silenceThreshold;
    } catch (err) { console.error("Audio analysis failed:", err); return true; }
  };

  // Downmix and resample audio so the models get a consistent signal
  const convertAudioToMono16k = async (file: File): Promise<File> => {
    const TARGET_SAMPLE_RATE = 16000;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const OfflineCtx = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      if (!AudioCtx || !OfflineCtx) {
        console.warn("Audio conversion not supported in this browser.");
        return file;
      }

      const audioContext = new AudioCtx();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      if (typeof audioContext.close === "function") {
        await audioContext.close().catch(() => undefined);
      }

      const frameCount = Math.ceil(decodedBuffer.duration * TARGET_SAMPLE_RATE);
      const offlineContext = new OfflineCtx(1, frameCount, TARGET_SAMPLE_RATE);
      const source = offlineContext.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(offlineContext.destination);
      source.start(0);

      const renderedBuffer = await offlineContext.startRendering();
      const wavArrayBuffer = audioBufferToWav(renderedBuffer);
      const baseName = file.name?.replace(/\.[^\/.]+$/, "") || "audio";
      return new File([wavArrayBuffer], `${baseName}_mono16k.wav`, { type: "audio/wav" });
    } catch (err) {
      console.error("Audio conversion failed:", err);
      return file;
    }
  };

  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const channelData = buffer.getChannelData(0);
    const { length } = channelData;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const dataSize = length * bytesPerSample;
    const bufferLength = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    const writeString = (view: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < length; i++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
    }

    return arrayBuffer;
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.match("audio.*")) { setError("Please upload a valid audio file (e.g., MP3, WAV, WEBM, M4A)"); return; }
    stopPlaybackAndReset(); revokeOldUrl();
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    setIsRecording(false); setRecordingAvailable(false);
    setAudioFile(file);
    const url = URL.createObjectURL(file); setAudioUrl(url);
    setTranscription(""); setCanSubmit(true); setError("");
  };

  const startRecording = async () => {
    setError(""); setIsRecording(true); setAudioFile(null); setAudioUrl(""); setTranscription(""); setCanSubmit(false);
    stopPlaybackAndReset(); revokeOldUrl();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], "recording.webm", { type: mimeType });
        const url = URL.createObjectURL(blob);
        stopPlaybackAndReset(); revokeOldUrl();
        setAudioFile(file); setAudioUrl(url); setRecordingAvailable(true); setCanSubmit(true);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start(); setMediaRecorder(recorder);
    } catch (err: any) {
      console.error("Recording error:", err);
      setError(err?.name === "NotAllowedError" ? "Microphone permission denied." : err?.name === "NotReadableError" ? "Microphone is already in use." : "Failed to start recording.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => { if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop(); setIsRecording(false); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!audioFile) throw new Error("Please upload or record an audio file");

      const silent = await isSilentAudio(audioFile);
      if (silent) throw new Error("The audio appears to be silent. Please try again.");

      setLoading(true);
      setTranscription("");
      setError("");
      setCanSubmit(false);

      // Convert audio to mono 16 kHz for upstream API
      const preparedFile = await convertAudioToMono16k(audioFile);
      const formData = new FormData();
      formData.append("file", preparedFile);

      // Pick endpoint
      let endpoint = "/api/transcribe";
      let qs = "?model_name=sm";

      if (model === "wav2vec") {
        endpoint = "/api/transcribe-wav2vec";
        qs = "?model_used=wav2vec2-bert-akan-ugspeechdata-v2";
      } else if (model === "whisper" && !isImpaired) {
        endpoint = "/api/transcribe-non-standard"; // proxy to avoid CORS; API uses production Modal URL
        qs = "?model_name=lg";
      }

      const res = await fetch(`${endpoint}${qs}` , {
        method: "POST",
        // Let the browser set multipart boundaries; do not set Content-Type manually
        headers: { Accept: "application/json" },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      if (!data?.text) {
        throw new Error("No text field in response. Check backend output.");
      }
      setTranscription(data.text);
    } catch (err: any) {
      console.error("handleSubmit error:", err);
      setError(err?.message || "An error occurred during transcription.");
    } finally {
      setLoading(false);
      setCanSubmit(true);
    }
  };

  useEffect(() => {
    const audio = audioRef.current; if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleLoaded = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioUrl]);

  useEffect(() => { if (language === "ewe") { setModel("wav2vec"); setIsImpaired("false"); } }, [language]);
  useEffect(() => { if (model === "wav2vec") setIsImpaired("false"); }, [model]);
  useEffect(() => { if (isImpaired === "false") setEtiology(""); }, [isImpaired]);

  useEffect(() => {
    if (wavesurfer.current) { try { wavesurfer.current.destroy(); } catch {} wavesurfer.current = null; }
    if (audioUrl && transcription && waveformRef.current) {
      const ws = WaveSurfer.create({ container: waveformRef.current, waveColor: "#ccc", progressColor: "#007bff", barWidth: 2, height: 80 });
      wavesurfer.current = ws; ws.load(audioUrl);
      ws.on("ready", () => { setDuration(ws.getDuration()); setCurrentTime(0); });
      ws.on("audioprocess", () => { setCurrentTime(ws.getCurrentTime()); });
      ws.on("finish", () => { setIsPlaying(false); setCurrentTime(ws.getDuration()); });
      (ws as any).setVolume?.(volume);
      return () => { try { ws.destroy(); } catch {} };
    }
  }, [audioUrl, transcription]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60); const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>UGVoice Transcribe</h1>
        <p className="subtitle">Convert speech to text with us</p>
      </header>

      <main className="main-content">
        <div className="upload-section card">
          <h2>Upload or Record Audio</h2>
          <form onSubmit={handleSubmit}>
            <div className="file-input-container">
              <label className="file-input-label">
                <input type="file" accept=".mp3,.wav,.webm,.m4a,audio/*" onChange={handleFileChange} className="file-input" />
                <span className="file-input-button">Choose Audio File</span>
                <span className="file-input-name">{audioFile ? audioFile.name : "No file selected"}</span>
              </label>
            </div>

            <div className="recording-controls">
              {!isRecording ? (
                <button type="button" className="record-button" onClick={startRecording}>🎤 Start Recording</button>
              ) : (
                <button type="button" className="stop-button" onClick={stopRecording}>⏹️ Stop</button>
              )}
              {isRecording && (<p className="recording-indicator">Recording...</p>)}
              {recordingAvailable && (<p className="recording-success">Recording ready for transcription</p>)}
            </div>

            <div className="form-controls">
              <div className="select-group">
                <label>Language:</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="select-input">
                  <option value="akan">Akan</option>
                  <option value="ewe">Ewe</option>
                </select>
              </div>

              <div className="select-group">
                <label>Model:</label>
                <select value={model} onChange={(e) => setModel(e.target.value)} className="select-input" disabled={language === "ewe"}>
                  <option value="wav2vec">Longer Phrases</option>
                  {language === "akan" && (<option value="whisper">Shorter Phrases</option>)}
                </select>
              </div>

              <div className="select-group">
                <label>Speech Impaired:</label>
                <select value={isImpaired} onChange={(e) => setIsImpaired(e.target.value)} className="select-input" disabled={model === "wav2vec" || language === "ewe"}>
                  <option value="false">No</option>
                  <option value="true">Yes(Speech Impaired Model)</option>
                </select>
              </div>

              {(isImpaired === "true" && model === "whisper" && language === "akan") && (
                <div className="select-group">
                  <label>Etiology:</label>
                  <select value={etiology} onChange={(e) => setEtiology(e.target.value)} className="select-input">
                    <option value="">Select Etiology</option>
                    <option value="gen-lg">Stammering</option>
                    <option value="gen-lg">Cerebral Palsy</option>
                    <option value="gen-lg">Cleft</option>
                  </select>
                </div>
              )}
            </div>

            <button type="submit" className="submit-button" disabled={loading || !canSubmit}>
              {loading ? (<><span className="spinner"></span>Processing...</>) : ("Transcribe Audio")}
            </button>
            {error && <div className="error-message">{error}</div>}
          </form>
        </div>

        {audioUrl && transcription && (
          <div className="audio-player card">
            <h2>Audio Player</h2>
            <div ref={waveformRef} className="waveform-container" />
            <div className="player-controls">
              <button onClick={() => {
                if (wavesurfer.current) {
                  if (isPlaying) { wavesurfer.current.pause(); setIsPlaying(false); }
                  else { wavesurfer.current.play(); setIsPlaying(true); }
                }
              }} className="play-button">
                {isPlaying ? "Pause" : "Play"}
              </button>

              {isMobile() ? (
                <p style={{ fontSize: "0.9rem", color: "#777" }}>Use your device volume buttons to control audio.</p>
              ) : (
                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => {
                  const vol = parseFloat(e.target.value); setVolume(vol);
                  (wavesurfer.current as any)?.setVolume?.(vol);
                }} />
              )}

              <div className="time-display">{formatTime(currentTime)} / {formatTime(duration)}</div>
            </div>
            <audio ref={audioRef} src={audioUrl} preload="metadata" />
          </div>
        )}

        {(transcription || loading) && (
          <div className="transcription-section card">
            <div className="section-header">
              <h2>Transcription Result</h2>
            </div>
            <div className="transcription-output">
              {loading ? <p>Processing...</p> : <p>{transcription}</p>}
            </div>
            {!loading && (<a target="_blank" href="https://forms.gle/X6JeXwnCZCtsaW9k7" rel="noreferrer">📋 Please click here to evaluate our app</a>)}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>© {new Date().getFullYear()} Akan ASR Transcriber</p>
      </footer>
    </div>
  );
}

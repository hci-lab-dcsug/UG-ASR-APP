"use client";
import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

type PrefixedWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

type WaveSurferWithVolume = WaveSurfer & {
  setVolume?: (v: number) => void;
};

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
  const [playerReady, setPlayerReady] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurfer = useRef<WaveSurferWithVolume | null>(null);

  const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const revokeOldUrl = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl("");
    }
  };

  const stopPlaybackAndReset = () => {
    if (wavesurfer.current) {
      try {
        wavesurfer.current.stop();
      } catch {
        /* noop */
      }
      setIsPlaying(false);
    }
    setCurrentTime(0);
    setDuration(0);
  };

  const isSilentAudio = async (file: File, silenceThreshold = 0.001) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const w = window as PrefixedWindow;
      const AudioCtor = window.AudioContext || w.webkitAudioContext;
      if (!AudioCtor) return true;
      const ctx = new AudioCtor();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      if (typeof ctx.close === "function") {
        await ctx.close().catch(() => undefined);
      }
      const channelData = audioBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) sum += Math.abs(channelData[i]);
      const average = sum / channelData.length;
      return average < silenceThreshold;
    } catch (err) {
      console.error("Audio analysis failed:", err);
      return true;
    }
  };

  // Downmix and resample audio so the models get a consistent signal
  const convertAudioToMono16k = async (file: File): Promise<File> => {
    const TARGET_SAMPLE_RATE = 16000;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const w = window as PrefixedWindow;
      const AudioCtor = window.AudioContext || w.webkitAudioContext;
      const OfflineCtor = window.OfflineAudioContext || w.webkitOfflineAudioContext;
      if (!AudioCtor || !OfflineCtor) {
        console.warn("Audio conversion not supported in this browser.");
        return file;
      }

      const audioContext = new AudioCtor();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      if (typeof audioContext.close === "function") {
        await audioContext.close().catch(() => undefined);
      }

      const frameCount = Math.ceil(decodedBuffer.duration * TARGET_SAMPLE_RATE);
      const offlineContext = new OfflineCtor(1, frameCount, TARGET_SAMPLE_RATE);
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

    const writeString = (dv: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) dv.setUint8(offset + i, str.charCodeAt(i));
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
    if (!file || !file.type.match("audio.*")) {
      setError("Please upload a valid audio file (e.g., MP3, WAV, WEBM, M4A)");
      return;
    }
    stopPlaybackAndReset();
    revokeOldUrl();
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    setIsRecording(false);
    setRecordingAvailable(false);
    setAudioFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setTranscription("");
    setCanSubmit(true);
    setError("");
  };

  const startRecording = async () => {
    setError("");
    setIsRecording(true);
    setAudioFile(null);
    setAudioUrl("");
    setTranscription("");
    setCanSubmit(false);
    stopPlaybackAndReset();
    revokeOldUrl();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], "recording.webm", { type: mimeType });
        const url = URL.createObjectURL(blob);
        stopPlaybackAndReset();
        revokeOldUrl();
        setAudioFile(file);
        setAudioUrl(url);
        setRecordingAvailable(true);
        setCanSubmit(true);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setMediaRecorder(recorder);
    } catch (err: unknown) {
      console.error("Recording error:", err);
      const name =
        err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
      setError(
        name === "NotAllowedError"
          ? "Microphone permission denied."
          : name === "NotReadableError"
          ? "Microphone is already in use."
          : "Failed to start recording."
      );
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    setIsRecording(false);
  };

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
      // formData.append("model", model);
      // formData.append("language", language);
      // formData.append("isImpaired", isImpaired);
      // formData.append("etiology", etiology);

      // // Pick endpoint
      // const endpoint = "http://localhost:8000/transcribe";
      // const qs = "";

      // console.log(model, language, isImpaired);

      let endpoint = "/api/transcribe";
      let qs = "?model_name=sm";
      
      if (model === "wav2vec") {
        endpoint = "/api/transcribe-wav2vec";
        qs = "?model_used=wav2vec2-bert-akan-ugspeechdata-v2";
      } else if (model === "whisper" && !isImpaired) {
        endpoint = "/api/transcribe-non-standard";
        qs = "?model_name=lg";
      }

      const res = await fetch(`${endpoint}${qs}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData ,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text.slice(0, 200)}`);
      }

      const data: { text?: string } = await res.json();
      if (!data?.text) throw new Error("No transcription field in response. Check backend output.");
      setTranscription(data.text);
    } catch (err: unknown) {
      console.error("handleSubmit error:", err);
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "An error occurred during transcription.";
      setError(message);
    } finally {
      setLoading(false);
      setCanSubmit(true);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
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

  useEffect(() => {
    if (language === "ewe") {
      setModel("wav2vec");
      setIsImpaired("false");
    }
  }, [language]);

  useEffect(() => {
    if (model === "wav2vec") setIsImpaired("false");
  }, [model]);

  useEffect(() => {
    if (isImpaired === "false") setEtiology("");
  }, [isImpaired]);

  // Create/destroy wavesurfer when audio & transcript ready 
  useEffect(() => {
    setPlayerReady(false);
    if (wavesurfer.current) {
      try {
        wavesurfer.current.destroy()
      } catch {
        /* noop */
      }
      wavesurfer.current = null;
    }
    if (audioUrl && transcription && waveformRef.current) {
      const ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "rgba(255, 255, 255, 0.35)",
        progressColor: "#ffffff",
        cursorColor: "rgba(255, 255, 255, 0.75)",
        barWidth: 2,
        barRadius: 2,
        height: 90,
        normalize: true,
        // responsive: true,
        // backgroundColor: "transparent",
      }) as WaveSurferWithVolume;

      wavesurfer.current = ws;
      ws.load(audioUrl);
      ws.on("ready", () => {
        setDuration(ws.getDuration());
        setCurrentTime(0);
        ws.setVolume?.(volume); // set initial volume safely
        setPlayerReady(true);
      });
      ws.on("audioprocess", () => {
        setCurrentTime(ws.getCurrentTime());
      });
      ws.on("finish", () => {
        setIsPlaying(false);
        setCurrentTime(ws.getDuration());
      });

      return () => {
        try {
          ws.destroy();
        } catch {
          /* noop */
        }
        setPlayerReady(false);
      };
    }
  }, [audioUrl, transcription]);

  // Update volume when slider changes (no need to recreate wavesurfer)
  useEffect(() => {
    if (wavesurfer.current?.setVolume) {
      wavesurfer.current.setVolume(volume);
    }
  }, [volume]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  return (
    <div className="app-shell">
      <header className="shell-header">
        <div className="brand">
          <span className="brand-mark">UG</span>
          <div className="brand-copy">
            <h1>UGVoice Transcribe</h1>
            {/* <p>Upload or Record your audio and get accurate transcriptions.</p> */}
          </div>
        </div>
        <div className="chip-row">
          <span className="status-chip">{language === "akan" ? "Akan" : "Ewe"} language</span>
          {/* <span className="status-chip">{model === "whisper" ? "Whisper" : "Wav2Vec"} model</span> */}
          {/* <span className={`status-chip ${isRecording ? "status-chip--pulse" : ""}`}>
            {isRecording
              ? "Recording..."
              : recordingAvailable
              ? "Recording ready"
              : audioFile
              ? "Audio loaded"
              : "Idle"}
          </span> */}
        </div>
      </header>

      <main className="shell-body">
        <section className="panel panel--form">
          <div className="panel-heading">
            <h2>Audio Intake</h2>
            {/* <p>Upload pristine audio or capture a new take, then tailor the model to your speaker.</p> */}
          </div>

          <ol className="stepper">
            <li className={`stepper-item ${audioFile || recordingAvailable ? "is-active" : ""}`}>
              <span className="stepper-index">1</span>
              <span>Choose source</span>
            </li>
            <li className={`stepper-item ${transcription ? "is-active" : ""}`}>
              <span className="stepper-index">2</span>
              <span>Review transcript</span>
            </li>
          </ol>

          <form onSubmit={handleSubmit} className="input-form">
            <label className="input-tile">
              <input
                type="file"
                accept=".mp3,.wav,.webm,.m4a,audio/*"
                onChange={handleFileChange}
                className="file-input-hidden"
              />
              <div className="input-trigger">
                <span className="input-trigger-label">Upload audio</span>
                <span className="input-trigger-hint">MP3, WAV, WEBM, M4A</span>
              </div>
              <span className="input-file-name">{audioFile ? audioFile.name : "No file selected"}</span>
            </label>

            <div className="recording-stack">
              {!isRecording ? (
                <button type="button" className="button button--ghost" onClick={startRecording}>
                  Start recording
                </button>
              ) : (
                <button type="button" className="button button--danger" onClick={stopRecording}>
                  Stop recording
                </button>
              )}
              {isRecording && <span className="recording-status recording-status--live">Recording...</span>}
              {!isRecording && recordingAvailable && (
                <span className="recording-status recording-status--ready">Captured and ready</span>
              )}
            </div>

            <div className="field-grid">
              <label className="field">
                <span className="field-label">Language</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option className="options" value="akan">Akan</option>
                  <option className="options"value="ewe">Ewe</option>
                </select>
              </label>

              <label className="field">
                <span className="field-label">Model</span>
                <select value={model} onChange={(e) => setModel(e.target.value)} disabled={language === "ewe"}>
                  <option className="options" value="wav2vec">Longer phrases</option>
                  {language === "akan" && <option className="options" value="whisper">Shorter phrases</option>}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Speech impaired</span>
                <select
                  value={isImpaired}
                  onChange={(e) => setIsImpaired(e.target.value)}
                  disabled={model === "wav2vec" || language === "ewe"}
                >
                  <option className="options" value="false">No</option>
                  <option className="options" value="true">Yes</option>
                </select>
              </label>

              {isImpaired === "true" && model === "whisper" && language === "akan" && (
                <label className="field">
                  <span className="field-label">Etiology</span>
                  <select value={etiology} onChange={(e) => setEtiology(e.target.value)}>
                    <option value="">Select etiology</option>
                    <option value="gen-lg">Stammering</option>
                    <option value="gen-lg">Cerebral palsy</option>
                    <option value="gen-lg">Cleft</option>
                  </select>
                </label>
              )}
            </div>

            <button type="submit" className="button button--primary button--wide" disabled={loading || !canSubmit}>
              {loading ? "Processing..." : "Transcribe audio"}
            </button>

            <p className="helper-text">
              We normalize every file to 16 kHz mono for more accurate transcriptions.
            </p>

            {error && <div className="notice notice--error">{error}</div>}
          </form>
        </section>

        <section className="panel panel--output">
          <div className="panel-heading">
            <h2>Playback and transcript</h2>
            {/* <p>Preview the waveform, manage playback, then review the generated text.</p> */}
          </div>

          <div className={`waveform-wrap ${audioUrl && transcription ? "is-active" : ""}`}>
            <div ref={waveformRef} className="waveform-canvas" />
            {!(audioUrl && transcription) && (
              <div className="empty-state">
                <p>
                  <strong>Waveform preview</strong> appears here once audio has been processed.
                </p>
              </div>
            )}
          </div>

          <div className="player-bar">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                if (!wavesurfer.current) return;
                if (isPlaying) {
                  wavesurfer.current.pause();
                  setIsPlaying(false);
                } else {
                  wavesurfer.current.play();
                  setIsPlaying(true);
                }
              }}
              disabled={!playerReady}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>

            <div className="volume-block">
              {isMobile() ? (
                <span className="hint-text">Use device buttons for volume</span>
              ) : (
                <div className="slider-wrap">
                  <input
                    className="range-input"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                  />
                  <span className="slider-value">{Math.round(volume * 100)}%</span>
                </div>
              )}
            </div>

            <div className="time-meter">
              <span>{formatTime(currentTime)}</span>
              <span className="divider">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" hidden />}

          <div className="transcription-card">
            <div className="transcription-header">
              <h3>Transcription</h3>
              {loading && <span className="pill pill--processing">Processing</span>}
            </div>
            <div className="transcription-body">
              {loading ? (
                <p>Generating text...</p>
              ) : transcription ? (
                <p>{transcription}</p>
              ) : (
                <p className="placeholder-copy">Your transcript will appear here after processing.</p>
              )}
            </div>
            {!loading && transcription && (
              <a className="accent-link" target="_blank" href="https://forms.gle/X6JeXwnCZCtsaW9k7" rel="noreferrer">
                Evaluate the experience
              </a>
            )}
          </div>
        </section>
      </main>

      <footer className="shell-footer">
        <p>Copyright {new Date().getFullYear()} Akan ASR Transcriber</p>
        <p>University of Ghana HCI Lab</p>
      </footer>
    </div>
  );
}

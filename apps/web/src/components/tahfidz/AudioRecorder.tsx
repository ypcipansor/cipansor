"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Square, Play, Pause, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface AudioRecorderProps {
  onUpload: (blob: Blob) => void;
  isUploading?: boolean;
}

export function AudioRecorder({ onUpload, isUploading }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setAudioBlob(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      toast.error("Tidak dapat mengakses mikrofon");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const deleteRecording = () => {
    setAudioUrl(null);
    setAudioBlob(null);
    setDuration(0);
    setIsPlaying(false);
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <Card className="border-dashed border-2">
      <CardContent className="p-6 flex flex-col items-center justify-center space-y-4">
        {!audioUrl ? (
          <>
            <div
              className={`p-4 rounded-full ${isRecording ? "bg-red-100 animate-pulse" : "bg-primary/10"}`}
            >
              <Mic
                className={`w-8 h-8 ${isRecording ? "text-red-600" : "text-primary"}`}
              />
            </div>
            <div className="text-center">
              <h3 className="font-semibold">
                {isRecording ? "Sedang Merekam..." : "Rekam Setoran"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isRecording
                  ? formatDuration(duration)
                  : "Klik tombol di bawah untuk mulai merekam audio"}
              </p>
            </div>
            {isRecording ? (
              <Button
                variant="destructive"
                size="lg"
                onClick={stopRecording}
                className="rounded-full w-16 h-16 p-0"
              >
                <Square className="fill-current" />
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={startRecording}
                className="rounded-full w-16 h-16 p-0"
              >
                <Mic className="w-8 h-8" />
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="w-full bg-secondary p-4 rounded-lg flex items-center space-x-4">
              <Button variant="ghost" size="icon" onClick={togglePlayback}>
                {isPlaying ? <Pause /> : <Play />}
              </Button>
              <div className="flex-1">
                <div className="h-1 bg-primary/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: isPlaying ? "100%" : "0%",
                      transition: isPlaying
                        ? `width ${duration}s linear`
                        : "none",
                    }}
                  />
                </div>
              </div>
              <span className="text-sm font-mono">
                {formatDuration(duration)}
              </span>
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            </div>
            <div className="flex space-x-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={deleteRecording}
                disabled={isUploading}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Hapus
              </Button>
              <Button
                className="flex-1"
                onClick={() => audioBlob && onUpload(audioBlob)}
                disabled={isUploading}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />{" "}
                {isUploading ? "Mengunggah..." : "Unggah Setoran"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

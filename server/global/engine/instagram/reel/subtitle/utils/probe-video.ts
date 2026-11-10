import { runProcess } from './process.js';

export type VideoInfo = { width: number; height: number; durationSeconds: number; frameRate: number };

export async function probeInstagramVideo(inputPath: string, ffprobePath = process.env.FFPROBE_PATH ?? 'ffprobe'): Promise<VideoInfo> {
  const { stdout } = await runProcess(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate:format=duration',
    '-of', 'json',
    inputPath,
  ], { label: 'Probe Instagram video' });

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }>; 
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const width = Number(stream?.width);
  const height = Number(stream?.height);
  const durationSeconds = Number(parsed.format?.duration);
  const parseRate = (value?: string): number => {
    if (!value) return Number.NaN;
    const [numerator, denominator] = value.split('/').map(Number);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return Number.NaN;
    return numerator / denominator;
  };
  const frameRate = parseRate(stream?.avg_frame_rate) || parseRate(stream?.r_frame_rate) || 30;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`Could not determine video dimensions for ${inputPath}.`);
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Could not determine video duration for ${inputPath}.`);
  }
  return { width, height, durationSeconds, frameRate };
}

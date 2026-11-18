import Innertube from 'youtubei.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

export interface TranscriptItem {
  start: number;
  duration: number;
  text: string;
}

/**
 * Extract transcript from a YouTube video.
 * Works with all languages including Japanese.
 */
async function extractTranscript(videoId: string, lang?: string): Promise<TranscriptItem[]> {
  const innertube = await Innertube.create();
  const videoInfo = await innertube.getBasicInfo(videoId);

  if (!videoInfo) {
    throw new Error('No captions data available for this video.');
  }

  const transcriptInfo = await videoInfo.getTranscript();

  // If a specific language is requested, select it
  if (lang) {
    const available = transcriptInfo.languages;
    // Find matching language code
    let targetLang = lang;
    const exactMatch = available.find((l) => l === lang);
    if (exactMatch) {
      targetLang = exactMatch;
    } else {
      // Try language prefix match (e.g. "ja" matches "ja-JP")
      const prefixMatch = available.find((l) => l.startsWith(lang + '-'));
      if (prefixMatch) {
        targetLang = prefixMatch;
      } else {
        // List available languages to help the user
        throw new Error(
          `Language "${lang}" not found. Available languages: ${available.join(', ')}`
        );
      }
    }
    await transcriptInfo.selectLanguage(targetLang);
  }

  // Access transcript data through transcriptInfo.transcript.content.body.initial_segments
  const body = transcriptInfo.transcript?.content?.body;
  const segments = body?.initial_segments;

  if (!segments || segments.length === 0) {
    throw new Error('No transcript data found for the selected language.');
  }

  // Convert transcript segments to TranscriptItem array
  const items: TranscriptItem[] = [];
  for (const segment of segments) {
    // TranscriptSectionHeader is a separator, skip it
    if ('start_ms' in segment && segment.start_ms != null) {
      const startMs = parseInt(segment.start_ms, 10);
      const endMs = parseInt(segment.end_ms, 10);
      const text = segment.snippet?.toString() || '';

      if (text) {
        items.push({
          start: startMs / 1000, // Convert milliseconds to seconds
          duration: (endMs - startMs) / 1000, // Convert milliseconds to seconds
          text,
        });
      }
    }
  }

  return items;
}

/**
 * Parse VTT (WebVTT) caption format into TranscriptItems.
 */
function parseVtt(vtt: string): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const lines = vtt.split('\n');
  let i = 0;

  // Skip the "WEBVTT" header
  if (lines[0]?.startsWith('WEBVTT')) {
    i = 1;
  }

  while (i < lines.length) {
    // Skip empty lines
    if (lines[i].trim() === '') {
      i++;
      continue;
    }

    // Read timestamp line: "0:00:00.000 --> 0:00:05.000" or "0:00.000 --> 0:05.000"
    const timestampLine = lines[i].trim();
    const tsMatch = timestampLine.match(
      /(\d+:\d{2}:\d{2}\.\d+)|(\d{2}:\d{2}\.\d+)\s*-->\s*(\d+:\d{2}:\d{2}\.\d+|\d{2}:\d{2}\.\d+)/
    );

    if (!tsMatch) {
      i++;
      continue;
    }

    let startTime: number;
    if (tsMatch[1]) {
      // HH:MM:SS.mmm format
      const parts = tsMatch[1].split(':');
      const secs = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
      startTime = secs;
    } else {
      // MM:SS.mmm format (only first capture group matched)
      const parts = tsMatch[2].split(':');
      startTime = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }

    // Parse end time from the --> part
    const arrowIdx = timestampLine.indexOf('-->');
    const endTimeStr = timestampLine.substring(arrowIdx + 3).trim();
    let endTime: number;
    if (endTimeStr.includes(':')) {
      const parts = endTimeStr.split(':');
      endTime = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    } else {
      const parts = endTimeStr.split(':');
      endTime = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }

    i++;

    // Read text lines until empty line
    let text = '';
    while (i < lines.length && lines[i].trim() !== '') {
      if (text) text += ' ';
      text += lines[i].trim();
      i++;
    }

    if (text) {
      items.push({ start: startTime, duration: endTime - startTime, text });
    }
  }

  return items;
}

/**
 * Format transcript as plain text (just the captions).
 */
export function formatPlainText(items: TranscriptItem[]): string {
  return items
    .sort((a, b) => a.start - b.start)
    .map((item) => item.text)
    .join(' ');
}

/**
 * Format transcript with timestamps.
 */
export function formatWithTimestamps(items: TranscriptItem[]): string {
  return items
    .sort((a, b) => a.start - b.start)
    .map((item) => {
      const mins = Math.floor(item.start / 60);
      const secs = Math.floor(item.start % 60);
      const time = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      return `[${time}] ${item.text}`;
    })
    .join('\n');
}

/**
 * Format transcript as SRT (SubRip subtitle format).
 */
export function formatAsSRT(items: TranscriptItem[]): string {
  const sorted = items.sort((a, b) => a.start - b.start);
  const toSrtTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  return sorted
    .map((item, i) => {
      const end = i + 1 < sorted.length ? sorted[i + 1].start : item.start + 3;
      return `${i + 1}\n${toSrtTime(item.start)} --> ${toSrtTime(end)}\n${item.text}\n`;
    })
    .join('\n');
}

/**
 * Parse CLI arguments for video ID and options.
 */
function parseArgs(): { videoUrl: string; format: 'text' | 'srt' | 'timestamps'; output?: string; lang?: string } {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
YouTube Transcript Extractor

Usage:
  npx yt-subtitle-extraction <video_url_or_id> [options]

Options:
  --format <text|srt|timestamps>   Output format (default: text)
  --output <file>                  Write to file instead of stdout
  --lang <code>                    Force a language code (e.g. ja, en, ko)
  --help, -h                       Show this help message

Examples:
  npx yt-subtitle-extraction dQw4w9WgXcQ
  npx yt-subtitle-extraction https://www.youtube.com/watch?v=dQw4w9WgXcQ --format srt --output subtitles.srt
  npx yt-subtitle-extraction https://www.youtube.com/watch?v=xxxx --lang ja
`);
    process.exit(0);
  }

  if (args.length === 0) {
    console.error('Error: Please provide a YouTube video URL or video ID.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  let videoUrl = args[0];
  let format: 'text' | 'srt' | 'timestamps' = 'text';
  let output: string | undefined;
  let lang: string | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--format':
        format = args[++i] as 'text' | 'srt' | 'timestamps';
        break;
      case '--output':
        output = args[++i];
        break;
      case '--lang':
        lang = args[++i];
        break;
    }
  }

  return { videoUrl, format, output, lang };
}

/**
 * Extract video ID from a YouTube URL.
 */
export function extractVideoId(url: string): string {
  // Handle https://www.youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // Handle https://youtu.be/VIDEO_ID
  const youtuBeMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (youtuBeMatch) return youtuBeMatch[1];

  // Handle https://www.youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // Handle https://www.youtube.com/shorts/VIDEO_ID
  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // Handle https://www.youtube.com/live/VIDEO_ID
  const liveMatch = url.match(/\/live\/([a-zA-Z0-9_-]{11})/);
  if (liveMatch) return liveMatch[1];

  // Assume it's already a video ID (11 characters)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  throw new Error(`Could not extract video ID from: ${url}`);
}

async function main() {
  const { videoUrl, format, output, lang } = parseArgs();
  const videoId = extractVideoId(videoUrl);

  console.log(`Extracting transcript for video: ${videoId}`);
  if (lang) console.log(`Using language: ${lang}`);

  let items: TranscriptItem[];
  try {
    items = await extractTranscript(videoId, lang);
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('No transcript or subtitles')) {
      console.error('Error: No transcript or subtitles are available for this video.');
    } else if (error.message.includes('private')) {
      console.error('Error: This video is private and its transcript cannot be accessed.');
    } else if (error.message.includes('No captions data')) {
      console.error('Error: This video has no captions or subtitles.');
    } else if (error.message.includes('Language') && error.message.includes('not found')) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }

  if (items.length === 0) {
    console.error('Error: No transcript data found. The video may have auto-generated captions that are unavailable.');
    process.exit(1);
  }

  let content: string;
  switch (format) {
    case 'srt':
      content = formatAsSRT(items);
      break;
    case 'timestamps':
      content = formatWithTimestamps(items);
      break;
    case 'text':
    default:
      content = formatPlainText(items);
      break;
  }

  if (output) {
    const dir = dirname(output);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(output, content, 'utf-8');
    console.log(`Transcript saved to: ${output}`);
  } else {
    process.stdout.write(content);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

# YT Subtitle Extraction

A work-in-progress TypeScript CLI tool for extracting transcripts from YouTube videos.

## Features

- Extract subtitles/transcripts from any public YouTube video
- Full Unicode support — Japanese, Korean, Chinese, Arabic, etc
- Multiple output formats: plain text, timestamps, and SRT (subtitle file)
- Works with video URLs or video IDs directly

## Installation

```bash
npm install
```

## Usage

```bash
# Basic usage — plain text output
npx tsx src/index.ts https://www.youtube.com/watch?v=VIDEO_ID

# Force Japanese language
npx tsx src/index.ts https://www.youtube.com/watch?v=VIDEO_ID --lang ja

# SRT subtitle format
npx tsx src/index.ts https://www.youtube.com/watch?v=VIDEO_ID --format srt --output subtitles.srt

# Text with timestamps
npx tsx src/index.ts https://www.youtube.com/watch?v=VIDEO_ID --format timestamps

# Just the video ID
npx tsx src/index.ts dQw4w9WgXcQ
```

## Output Formats

| Format | Description |
|--------|-------------|
| `text` | Plain text, all captions concatenated (default) |
| `timestamps` | Each caption with `[MM:SS]` prefix |
| `srt` | SubRip subtitle format |

## Language Support

The tool automatically detects available captions. Use `--lang` to force a specific language:

| Code | Language |
|------|----------|
| `ja` | Japanese |
| `en` | English |
| `ko` | Korean |
| `zh` | Chinese |
| `es` | Spanish |
| `fr` | French |
| `de` | German |
| `pt` | Portuguese |

## Requirements

- Node.js 18+ (for ES module support)

# Product Requirements Document (PRD)
## OmniStream: Universal Media Streaming & Downloader Suite

**Version:** 1.0.0  
**Status:** Approved / Production-Ready  
**Author:** Lead Systems Architect & Senior Product Engineer  
**Date:** October 2026  
**Target Systems:** Web (Cross-Platform Responsive: Mobile iOS/Android, Windows Desktop, macOS, Linux)

---

## 1. Executive Summary & Vision

### 1.1 Product Overview
**OmniStream** is an all-in-one media extraction, live streaming, and high-speed downloading web application designed for high performance, reliability, and modern aesthetics. It connects to a high-throughput backend media processing gateway (`prexzyapis.com`) to deliver instant URL resolution, multi-quality video/audio playback, gallery extraction, and batch downloading across the internet's most popular platforms: **YouTube, Facebook, Instagram, TikTok, Pinterest, and Terabox (1024tera)**.

### 1.2 Core Value Propositions
1. **Universal Ingestion**: Paste any URL from YouTube, Instagram, TikTok, Facebook, Pinterest, or Terabox; the engine auto-identifies the platform, extracts available streams, and normalizes them into unified metadata.
2. **Instant In-Browser Streaming**: Users do not need to download heavy video files to preview content. OmniStream features a hardware-accelerated HTML5/HLS media player with multi-resolution switching, picture-in-picture, playback speed regulation, and cinema mode.
3. **Multi-Resolution Download Engine**: Delivers direct and proxied download pipelines across all provided resolutions (1080p Full HD, 720p HD, 480p, 360p, MP4, MP3 320kbps audio, and source image files).
4. **Dedicated Terabox Cloud Streamer**: Deep integration with Terabox / 1024tera cloud links, allowing users to browse shared folders, list individual video and image files, stream `.m3u8` streams directly, and grab direct download links without requiring the desktop Terabox client.
5. **Integrated Media Search Hub**: Embedded search engine querying YouTube and Pinterest to discover trending videos, playlists, audio tracks, and aesthetic imagery with 1-click transition into streaming or download.
6. **Enterprise-Grade Admin Console**: Secure, password-protected administrative command center providing real-time request audits, API endpoint latency monitors, platform usage distribution, system broadcast banners, and exportable CSV/JSON audit trails.

---

## 2. System Architecture & Data Flow

```
[ Client Browser (Mobile / Desktop) ]
                │
                ▼ (HTTP / REST / Range Streaming)
[ Express Backend Proxy (server.ts) ]
        ├── Auth Guard (ADMIN_PASSWORD Verification)
        ├── URL Normalizer & Platform Classifier
        ├── Stream Range-Request Proxy (CORS & Referrer Scrubbing)
        ├── Circular Audit Ring Buffer (In-Memory & Persistent)
        └── Health Prober (Latency & Availability)
                │
                ▼ (Upstream HTTPS REST)
[ Upstream Media Gateway (PREXZY_API_BASE_URL) ]
  ├── /download/aiov2?url=...
  ├── /download/ytinfo?url=...
  ├── /download/ytmp4?url=...
  ├── /download/ytmp3?url=...
  ├── /download/facebookv2 (POST)
  ├── /download/instagram?url=...
  ├── /download/pinterestV2?url=...
  ├── /download/tiktokv2?url=...
  ├── /download/terabox?url=...
  ├── /search/youtube?q=...
  └── /search/pinterest?q=...
```

### 2.1 Backend Proxy Architecture
Direct browser-to-gateway calls often fail due to three primary constraints:
- **CORS Violations**: Upstream media CDN servers (e.g. `googlevideo.com`, `fbcdn.net`, `snapcdn.app`, `1024tera.com`) block cross-origin requests from web applications.
- **Referrer Checking**: Many video CDNs strictly drop connections containing unknown `Referer` headers.
- **Range Request Buffering**: Media players require HTTP 206 Partial Content headers (`Range: bytes=X-Y`) to allow seeking through large video streams without loading the entire payload.

OmniStream's Node/Express backend acts as an intelligent streaming proxy:
- Handles byte-range forwarding for fluid seeking in audio/video players.
- Scrubs identifying referrer headers before streaming.
- Strips content security restrictions, injecting client-friendly `Accept-Ranges`, `Content-Length`, and `Content-Type` headers.

---

## 3. Supported Platforms & API Specifications

| # | Platform | Upstream Endpoint | Method | Key Parameters | Output Data |
|---|----------|-------------------|--------|----------------|-------------|
| 1 | **All-in-One (AIO)** | `/download/aiov2` | `GET` | `url={URL}` | Auto-parsed video/audio download links & title |
| 2 | **YouTube Info** | `/download/ytinfo` | `GET` | `url={URL}` | Full video metadata, views, duration, author, thumbnail |
| 3 | **YouTube Video** | `/download/ytmp4` | `GET` | `url={URL}` | 1080p, 720p, 480p, 360p, 240p, 144p MP4 streams |
| 4 | **YouTube Audio** | `/download/ytmp3` | `GET` | `url={URL}` | High-bitrate MP3/M4A audio stream & size |
| 5 | **Facebook** | `/download/facebookv2` | `POST` | `{"url": "{URL}"}` | 720p HD, 360p SD MP4 download links & thumbnail |
| 6 | **Instagram** | `/download/instagram` | `GET` | `url={URL}` | Reels, Posts, Carousel video/photo URLs |
| 7 | **TikTok** | `/download/tiktokv2` | `GET` | `url={URL}` | Watermark-free HD MP4, audio track, author info |
| 8 | **Pinterest** | `/download/pinterestV2` | `GET` | `url={URL}` | High-res pin image or video download link |
| 9 | **Terabox** | `/download/terabox` | `GET` | `url={URL}` | Folder directory, file listing, `.m3u8` stream, thumbnails |
| 10 | **YouTube Search** | `/search/youtube` | `GET` | `q={Query}` | List of video matches with channel, duration, links |
| 11 | **Pinterest Search** | `/search/pinterest` | `GET` | `q={Query}` | Array of direct high-resolution image pins |

---

## 4. Detailed Feature Specifications

### 4.1 Universal Streamer & Downloader (Module 1)
- **Input Controls**:
  - Unified URL input with auto-paste support.
  - Interactive platform quick-filter badges (`Auto Detect`, `YouTube`, `Terabox`, `TikTok`, `Instagram`, `Facebook`, `Pinterest`, `AIO`).
  - Sample URL loader for one-click testing without external lookups.
- **Unified Media Presentation**:
  - Media hero card featuring title, author/uploader, duration, view count, and formatted upload date.
  - In-browser interactive media player supporting:
    - Quality resolution selection on the fly.
    - Play / Pause, volume scrubber with mute toggle.
    - Fullscreen and Picture-in-Picture (PiP) APIs.
    - Playback rate adjustment (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x).
    - Loop toggle and download shortcut.
- **Download Quality Matrix**:
  - High-density table listing every available stream.
  - Columns: Format, Resolution, File Size, Codec/Type, Stream Action, Download Action.
  - Download trigger offers direct browser trigger or server-proxied attachment stream (`/api/proxy-download`).

### 4.2 Terabox Cloud Streamer (Module 2)
- **Folder & File Explorer**:
  - Unpacks shared Terabox links (e.g. `1024tera.com/s/...`).
  - Aggregates file statistics: Total files, folders, videos, photos, and root path.
  - Search/filter files by name or category (Video vs Photo).
- **Direct Cloud Playback**:
  - Resolves `streamUrl` (`.m3u8` / auto-transcoded stream) directly in the integrated video player.
  - Displays high-resolution thumbnail previews generated by Terabox CDN.
  - 1-click instant download links with formatted file sizes (e.g. `7.02 MB`).

### 4.3 Discover & Search Hub (Module 3)
- **YouTube Engine**:
  - Queries `https://prexzyapis.com/search/youtube?q={query}`.
  - Displays video title, channel name, duration badge, high-res thumbnail.
  - "Stream Now" button immediately mounts the item in the active player.
  - "Extract Qualities" button triggers deep resolution extraction.
- **Pinterest Engine**:
  - Queries `https://prexzyapis.com/search/pinterest?q={query}`.
  - Masonry grid layout with image zoom and direct download.

### 4.4 Advanced Administrative Console (Module 4)
- **Authentication**:
  - Protected by `ADMIN_PASSWORD` (configured via server environment or dynamic fallback).
  - Client stores an ephemeral session token with configurable auto-logout.
- **Live System Telemetry & Health Monitor**:
  - Probes all 10 upstream endpoints with ping latency (ms) and status codes (200 OK / Error).
  - Visual status chips with response duration metrics.
- **Detailed Audit Logs**:
  - Circular buffer logging of the last 1,000 transactions.
  - Fields recorded: Timestamp (ISO), Platform, Action (`extract`, `stream`, `download`, `search`), Input URL / Query, HTTP Status, Latency (ms), Client IP, User Agent.
  - Real-time client-side search and filtering by platform or status.
  - "Inspect Request Payload" drawer for developer debugging.
  - Export capabilities: Download full audit trail as `.CSV` or `.JSON`.
- **System Configuration**:
  - Dynamic `PREXZY_API_BASE_URL` override for failover routing.
  - Simulated rate-limit and latency toggle for load testing.
  - Real-time System Announcement Banner editor (broadcasts emergency alerts or maintenance notifications to all users).

---

## 5. Security, Privacy & Performance

### 5.1 Security Controls
- **Sanitized Proxies**: All downstream media requests are strictly validated against allowable URL protocols (`http:` and `https:`) to prevent SSRF (Server-Side Request Forgery).
- **Environment Isolation**: Administrative credentials and upstream base URLs are stored in server-side environment variables and never leaked to the client bundle.
- **Header Masking**: Express proxy eliminates vulnerable client IP leaks to third-party CDNs while preserving legitimate media delivery.

### 5.2 Performance & Responsiveness
- **Desktop (Windows/Mac/Linux)**: Fluid 1440px viewport presentation with dual-pane layout (Player on left, format matrix on right).
- **Mobile (iOS/Android)**: Touch-optimized stacked layout with responsive media controls, sticky audio drawer, and non-blocking download queues.
- **Latency Targets**:
  - URL classification: $< 5\text{ms}$.
  - Upstream gateway resolution: $\le 1200\text{ms}$ average.
  - Stream proxy startup time: $< 200\text{ms}$.

---

## 6. Environment Configuration

| Variable Name | Required | Default Value | Description |
|---|---|---|---|
| `PORT` | Optional | `3000` | Port for the Express server and Vite application |
| `PREXZY_API_BASE_URL` | Optional | `https://prexzyapis.com` | Base URL for the upstream media API suite |
| `ADMIN_PASSWORD` | Optional | `admin_stream_pass_2026` | Password required to access the administrative dashboard |
| `APP_URL` | Optional | `http://localhost:3000` | Public deployment URL of the OmniStream instance |

---

## 7. Quality Assurance & Verification Matrix

- **Unit Testing**: Decoupled regex and parser suite testing platform detection and data normalization (`mediaParser.test.ts`).
- **End-to-End Visual Verification**: Real Chromium headless verification under Ultra Mode testing:
  - Input submission and media resolution.
  - Media player mounting and playback control triggers.
  - Terabox folder unpacking and file stream switching.
  - Search hub querying and 1-click streaming transfer.
  - Admin login authentication, live health prober, and log export.
  - PRD interactive viewer and file download trigger.

# File-Merger

A web-based application to merge multiple PDFs and images into a single PDF file. Perfect for combining homework assignments, scans, and documents.

## Features

✨ **Supported Formats**: PDF, PNG, JPG, JPEG, GIF, BMP, WebP
📁 **Drag & Drop**: Easy file upload with drag and drop support
🔄 **Auto Conversion**: Images are automatically converted to PDF format
⬇️ **Download**: Merged PDF is automatically downloaded to your device
🎨 **Clean UI**: User-friendly interface with real-time feedback
🔒 **Production Security**: Helmet headers + rate limiting + strict upload validation
📊 **Health Check**: `/healthz` endpoint for uptime monitoring

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   npm start
   ```

3. **Access the Application**
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## How to Use

1. **Upload Files**
   - Click the upload area or drag & drop your files
   - Supports PDF, PNG, JPG, GIF, BMP, and WebP formats

2. **Organize Files**
   - Files will be merged in the order they appear
   - Remove unwanted files by clicking the ✕ button

3. **Merge & Download**
   - Click "Merge Files" button
   - The merged PDF will automatically download

4. **Submit Your Homework**
   - Use the downloaded merged.pdf for your submission

## Technology Stack

- **Backend**: Express.js (Node.js)
- **PDF Processing**: pdf-lib (PDF creation and manipulation)
- **Image Processing**: sharp (image conversion)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript

## File Size Limits

- Maximum file size per upload: 50MB (configurable)
- Recommended total size for all files: < 200MB (configurable)

## Production Configuration

Copy `.env.example` to `.env` and tune as needed:

- `RATE_LIMIT_MAX`: merge requests allowed per 15 minutes per IP
- `MAX_FILE_SIZE_MB`: max size per uploaded file
- `MAX_TOTAL_UPLOAD_MB`: max combined upload size per request
- `MAX_FILES`: max files per merge request
- `MAX_CONCURRENT_MERGES`: max parallel merge jobs
- `REQUEST_TIMEOUT_MS`: server request timeout

## Security & Abuse Controls

- Upload rate limiting on `/merge`
- MIME + extension checks at upload time
- Content validation for PDFs and images before processing
- Automatic temp file cleanup for all request paths
- Defensive HTTP headers via Helmet

## Health Check

Use this endpoint for monitoring and platform health probes:

```bash
curl http://localhost:3000/healthz
```

Expected response:

```json
{"status":"ok","activeMerges":0}
```

## Deploy Publicly (Render)

This repo includes `render.yaml` for one-click deployment.

1. Push this repo to GitHub.
2. In Render, choose **New +** -> **Blueprint**.
3. Select this repository.
4. Render will detect `render.yaml` and deploy automatically.
5. After deploy, open your `onrender.com` URL.

## Deploy Publicly (Docker)

Build and run locally:

```bash
docker build -t file-merger .
docker run --rm -p 3000:3000 --env-file .env file-merger
```

## Notes

- Files are processed in the order they appear in the list
- Images are converted to PDF format before merging
- The application creates a temporary uploads folder for processing (cleaned up after merge)
- Your files are not stored on the server - they're deleted after processing
- Uploaded files are rejected if they fail validation

## Troubleshooting

**Issue**: "No valid files found"
- Make sure you're uploading supported file formats (PDF, PNG, JPG, etc.)

**Issue**: Files not merging properly
- Try reducing file sizes or number of files
- Check browser console for detailed error messages

**Issue**: Port 3000 is already in use
- Change the port by setting the PORT environment variable:
  ```bash
  PORT=3001 npm start
  ```
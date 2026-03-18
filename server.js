const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/bmp',
  'image/webp'
]);
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BYTES = Number(process.env.MAX_TOTAL_UPLOAD_MB || 200) * 1024 * 1024;
const MAX_FILES = Number(process.env.MAX_FILES || 30);
const MAX_CONCURRENT_MERGES = Number(process.env.MAX_CONCURRENT_MERGES || 5);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000);
let activeMerges = 0;

const app = express();
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const mergeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many merge requests. Please try again later.' }
});

// Setup multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(mime)) {
      return cb(new Error(`Unsupported file type: ${file.originalname}`));
    }

    cb(null, true);
  }
});

function hasPdfSignature(buffer) {
  return buffer.length >= 5 && buffer.slice(0, 5).toString() === '%PDF-';
}

async function isSupportedImageBuffer(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return ['png', 'jpeg', 'gif', 'webp', 'bmp'].includes(metadata.format);
  } catch (error) {
    return false;
  }
}

async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not remove temp file: ${filePath}`);
    }
  }
}

// Convert image to PDF bytes
async function imageToPdf(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const pdfDoc = await PDFDocument.create();

  // Convert image to PNG format
  const pngBuffer = await sharp(imageBuffer)
    .png()
    .toBuffer();

  const image = await pdfDoc.embedPng(pngBuffer);
  const page = pdfDoc.addPage([metadata.width, metadata.height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: metadata.width,
    height: metadata.height,
  });

  return await pdfDoc.save();
}

// Merge PDFs
async function mergePdfs(pdfBuffers) {
  const mergedPdf = await PDFDocument.create();

  for (const pdfBuffer of pdfBuffers) {
    const pdf = await PDFDocument.load(pdfBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach((page) => {
      mergedPdf.addPage(page);
    });
  }

  // pdf-lib returns a Uint8Array; convert to Buffer for a binary HTTP response.
  return Buffer.from(await mergedPdf.save());
}

// Upload and merge endpoint
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', activeMerges });
});

app.post('/merge', mergeRateLimiter, upload.array('files', MAX_FILES), async (req, res) => {
  let mergeSlotTaken = false;

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const totalBytes = req.files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      return res.status(400).json({ error: 'Total upload size is too large' });
    }

    if (activeMerges >= MAX_CONCURRENT_MERGES) {
      return res.status(429).json({ error: 'Server is busy. Please retry shortly.' });
    }

    activeMerges += 1;
    mergeSlotTaken = true;

    const pdfBuffers = [];

    // Process each file
    for (const file of req.files) {
      const filePath = file.path;
      const ext = path.extname(file.originalname).toLowerCase();

      try {
        const uploadedBuffer = await fs.promises.readFile(filePath);

        if (ext === '.pdf') {
          if (!hasPdfSignature(uploadedBuffer)) {
            throw new Error('Invalid PDF file signature');
          }

          // Validate PDF can be parsed before merge
          await PDFDocument.load(uploadedBuffer);
          pdfBuffers.push(uploadedBuffer);
        } else if (ALLOWED_EXTENSIONS.has(ext)) {
          if (!(await isSupportedImageBuffer(uploadedBuffer))) {
            throw new Error('Invalid image file');
          }

          // Convert image to PDF
          const pdfBuffer = await imageToPdf(uploadedBuffer);
          pdfBuffers.push(pdfBuffer);
        } else {
          console.warn(`Unsupported file type: ${ext}`);
        }
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        return res.status(400).json({ error: `Invalid input file: ${file.originalname}` });
      } finally {
        // Clean up uploaded file
        await safeUnlink(filePath);
      }
    }

    if (pdfBuffers.length === 0) {
      return res.status(400).json({ error: 'No valid PDF or image files found' });
    }

    // Merge all PDFs
    const mergedPdf = await mergePdfs(pdfBuffers);

    // Send merged PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
    res.setHeader('Content-Length', mergedPdf.length);
    res.send(mergedPdf);

  } catch (error) {
    console.error('Error during merge:', error);
    res.status(500).json({ error: 'Error merging files: ' + error.message });
  } finally {
    if (mergeSlotTaken) {
      activeMerges = Math.max(0, activeMerges - 1);
    }
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'A file exceeds the maximum file size limit' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: `Too many files uploaded. Maximum is ${MAX_FILES}` });
    }

    return res.status(400).json({ error: error.message });
  }

  if (error && error.message && error.message.startsWith('Unsupported file type:')) {
    return res.status(400).json({ error: error.message });
  }

  return next(error);
});

app.use((error, req, res, next) => {
  console.error('Unhandled server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`File Merger running on http://localhost:${PORT}`);

  // Create uploads directory if it doesn't exist
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }
});

server.timeout = REQUEST_TIMEOUT_MS;

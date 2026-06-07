import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import path from 'path';

let worker = null;

async function getWorker() {
  if (worker) return worker;
  
  const start = Date.now();
  console.log('[ocr] Initializing worker...');
  
  worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {},
    langPath: path.join(process.cwd()),
    gzip: false,
    cacheMethod: 'none',
  });
  
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
  });
  
  console.log(`[ocr] Worker ready in ${Date.now() - start}ms`);
  return worker;
}

export async function solveCaptchaImage(cookie) {
  const start = Date.now();
  const imgRes = await fetch('https://payments.billdesk.com/MercOnline/NumericCaptchaServlet', {
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://payments.billdesk.com/MercOnline/SPDCLController'
    }
  });

  if (!imgRes.ok) throw new Error(`Image fetch failed`);

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`[ocr] Image fetched in ${Date.now() - start}ms (${buffer.length} bytes)`);

  // Restoring image preprocessing for accuracy and speed
  // BillDesk captchas have background lines; thresholding removes them.
  const processedBuffer = await sharp(buffer)
    .greyscale()
    .normalize()
    .threshold(160)
    .toBuffer();
  
  console.log(`[ocr] Image processed in ${Date.now() - start}ms`);

  const w = await getWorker();
  const ocrStart = Date.now();
  
  const { data: { text } } = await w.recognize(processedBuffer);
  
  const total = Date.now() - start;
  const result = text.trim().slice(0, 6);
  console.log(`[ocr] Solved: "${result}" in ${Date.now() - ocrStart}ms (Total: ${total}ms)`);
  
  return result;
}
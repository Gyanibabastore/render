const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const ejs = require('ejs');

// ✅ Sanitize file names
function sanitize(str) {
  return str
    .replace(/[^a-z0-9-_]/gi, '_')
    .substring(0, 30);
}

async function generatePDFWithTemplate(templateNumber, lrData, rawMessage) {
  const templatePath = path.join(__dirname, `./templates/template${templateNumber}.ejs`);
  
  const safeFileName = sanitize(rawMessage || 'message');
  const outputDir = path.join(__dirname, './generated');

  // Create output folder if not exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `LR-${safeFileName}-${Date.now()}.pdf`);

  // Render EJS to HTML
  const html = await ejs.renderFile(templatePath, lrData);

  // ✅ Launch Puppeteer (Root/Docker safe)
  const browser = await puppeteer.launch({
    headless: true, // change to 'new' if using puppeteer >= 20
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',    // Fix crash in Docker with limited /dev/shm
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',           // Optional: may improve Docker stability
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true
  });

  await browser.close();

  return outputPath;
}

module.exports = generatePDFWithTemplate;
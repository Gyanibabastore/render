const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

async function generatePDFWithTemplate(templateNumber, lrData, rawMessage = 'message') {
  try {
    // ✅ Prepare paths
    const templatePath = path.join(__dirname, `./templates/template${templateNumber}.ejs`);
    const safeFileName = rawMessage.replace(/[^a-z0-9-_]/gi, '_').substring(0, 30);
    const outputDir = path.join(__dirname, './generated');
    const outputPath = path.join(outputDir, `LR-${safeFileName}-${Date.now()}.pdf`);

    // ✅ Ensure output dir exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // ✅ Render HTML from EJS
    const html = await ejs.renderFile(templatePath, lrData);

    // ✅ Get chromium path
    const executablePath = await chromium.executablePath;

    if (!executablePath) {
      console.error("❌ chromium.executablePath returned null. Check environment.");
      throw new Error("❌ Chromium executable not found. Cannot generate PDF.");
    }

    // ✅ Launch puppeteer
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    // ✅ Generate PDF
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
    });

    await browser.close();

    console.log(`✅ PDF generated: ${outputPath}`);
    return outputPath;

  } catch (err) {
    console.error("❌ PDF Generation Failed:", err.message || err);
    throw err;
  }
}

module.exports = generatePDFWithTemplate;

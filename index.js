const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();
const sendPDF = require('./sendPDF');
const generatePDFWithTemplate = require('./templateManager');
const { extractDetails, isStructuredLR } = require('./utils/lrExtractor');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logToExcel = require('./excelLogger');
const sendExcel = require('./sendExcel');
const { Template } = require('ejs');
const XLSX = require('xlsx');

const app = express();
app.use(bodyParser.json());

const ADMIN_NUMBER = process.env.ADMIN_NUMBER;
const allowedNumbersPath = path.join(__dirname, './allowedNumbers.json');
let allowedNumbers = JSON.parse(fs.readFileSync(allowedNumbersPath, 'utf8'));

let sentNumbers = [];
let currentTemplate = 1;
let awaitingTemplateSelection = false;
let awaitingHelpSelection = false;
let awaitingMonthSelection = false;

function saveAllowedNumbers() {
  fs.writeFileSync(allowedNumbersPath, JSON.stringify(allowedNumbers, null, 2));
}

async function sendWhatsAppMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}




app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const entry = req.body?.entry?.[0];
  const changes = entry?.changes?.[0]?.value;
  const messages = changes?.messages?.[0];

  if (!messages) return res.sendStatus(200);

  const from = messages.from;
  const message = messages.text?.body?.trim();
  adminNumbers=process.env.ADMIN_NUMBER;
 if (!allowedNumbers.includes(from) && !adminNumbers.includes(from)) {
      console.log(`⛔ Blocked message from unauthorized number: ${from}`);
      return res.sendStatus(200); // silently ignore
    }
  if (typeof message !== 'string') {
  console.error('❌ Invalid message:', message);
  return res.status(400).send('Message is required');
}
let cleanedMessage = message.toLowerCase();


  console.log("👤 From:", from);
  console.log("💬 Message:", message);
  console.log("🧼 Cleaned:", cleanedMessage);
  console.log("🔧 Admin:", ADMIN_NUMBER);

  if (from === ADMIN_NUMBER) {
     if (from === ADMIN_NUMBER) {
    if (['change template', 'home'].includes(cleanedMessage)) {
      awaitingTemplateSelection = true;

      const textBody = `📂 *Choose your PDF Template:*\n\n` +
        `1️⃣ Template 1\n2️⃣ Template 2\n3️⃣ Template 3\n4️⃣ Template 4\n` +
        `5️⃣ Template 5\n6️⃣ Template 6\n7️⃣ Template 7\n8️⃣ Template 8\n\n` +
        `🟢 *Reply with a number (1–8) to select.*`;

      await sendWhatsAppMessage(from, textBody);
      return res.sendStatus(200);
    }

    // ✅ Handle Template Selection
    if (awaitingTemplateSelection && /^[1-8]$/.test(cleanedMessage)) {
      currentTemplate = parseInt(cleanedMessage);
      awaitingTemplateSelection = false;
      await sendWhatsAppMessage(from, `✅ Template ${currentTemplate} selected.`);
      return res.sendStatus(200);
    }

    // 🆘 HELP MENU with options
  // 🆘 HELP MENU
if (cleanedMessage === 'help') {
  awaitingTemplateSelection = false;
awaitingHelpSelection = false;
 awaitingMonthSelection = false;
  const helpMsg =
`🛠️ *Admin Control Panel*  
━━━━━━━━━━━━━━━━━━  
1️⃣ Change Template  
2️⃣ Add Number  
3️⃣ Remove Number  
4️⃣ List Allowed Numbers  
5️⃣ Send Excel Log to Admin  
━━━━━━━━━━━━━━━━━━  

🟢 *Reply with 1–5 to choose a command.*`;

  awaitingHelpSelection = true;
  await sendWhatsAppMessage(from, helpMsg);
  return res.sendStatus(200);
}

// 🔁 Handle Help Menu Options (1–5)
if (awaitingHelpSelection) {
  // Don't reset awaitingHelpSelection until valid option is received
  
    if(cleanedMessage==1){
      awaitingHelpSelection = false;
      const templateMenu =
`📂 *Choose Your PDF Template*  
━━━━━━━━━━━━━━━━━━  
1️⃣ Template 1  
2️⃣ Template 2  
3️⃣ Template 3  
4️⃣ Template 4  
5️⃣ Template 5  
6️⃣ Template 6  
7️⃣ Template 7  
8️⃣ Template 8  
━━━━━━━━━━━━━━━━━━  

🟢 *Reply with a number (1–8) to select.*`;

      awaitingTemplateSelection = true;
      await sendWhatsAppMessage(from, templateMenu);
      return res.sendStatus(200);
    }
  }
    if (cleanedMessage==2)
     cleanedMessage='add'

    else if(cleanedMessage==2){
   awaitingHelpSelection = false;
   cleanedMessage='remove'
    }
      
     

     else if(cleanedMessage==4){
      awaitingHelpSelection = false;
    cleanedMessage='list'
     }
   else if (cleanedMessage === '5') {
  selectedHelpOption = null; // reset

  try {
    const excelPath = path.join(__dirname, 'generatedLogs.xlsx');

    const now = new Date();
    const monthYear = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    console.log(`📅 Requested monthly log: ${monthYear}`);

    if (!fs.existsSync(excelPath)) {
      console.log(`⚠️ Excel file not found: ${excelPath}`);
      await sendWhatsAppMessage(from, `⚠️ *Excel log file not found.*`);
      return res.sendStatus(200);
    }

    const workbook = XLSX.readFile(excelPath);

    if (!workbook.SheetNames.includes(monthYear)) {
      console.log(`📁 No sheet found for ${monthYear}`);
      await sendWhatsAppMessage(from, `📁 *No log found for ${monthYear}.*`);
      return res.sendStatus(200);
    }

    const tempWorkbook = XLSX.utils.book_new();
    tempWorkbook.SheetNames.push(monthYear);
    tempWorkbook.Sheets[monthYear] = workbook.Sheets[monthYear];

    const tempFilePath = path.join(__dirname, `Rudransh_Trading_${monthYear.replace(' ', '_')}.xlsx`);
    XLSX.writeFile(tempWorkbook, tempFilePath);
    console.log(`📎 Temporary Excel file created: ${tempFilePath}`);

    await sendExcel(from, tempFilePath, `📊 *Here is your log for ${monthYear}.*`);
    console.log(`✅ Excel log sent to: ${from}`);

    fs.unlinkSync(tempFilePath);
    console.log(`🗑️ Temporary file deleted: ${tempFilePath}`);
  } catch (err) {
    console.error('❌ Error sending Excel log:', err.message);
    await sendWhatsAppMessage(from, `❌ *Failed to send monthly Excel log.*`);
  }

  return res.sendStatus(200);
}






    // ➕ ADD NUMBER
if (cleanedMessage.startsWith('add')) {
  const parts = cleanedMessage.split(' ');
  const numberToAdd = parts[1];

  if (!numberToAdd) {
    await sendWhatsAppMessage(from,
  `ℹ️ *Usage | उपयोग:*\n\n` +
  `🗑️ *Reply with:*\n\`add <number>\`\n\n` +
  `📌 *Example:*\n\`add 919876543210\`\n\n` +
  `🟢 *Adds number to admin list*`
);

    return res.sendStatus(200);
  }

  if (!/^91\d{10}$/.test(numberToAdd)) {
    await sendWhatsAppMessage(from,
      `❌ *Invalid number format:* \`${numberToAdd}\`\n🔢 *Must start with \`91\` and contain exactly 12 digits*\n\n✅ Example: \`add 919876543210\``
    );
    return res.sendStatus(200); // 👈 stays in same state
  }

  if (allowedNumbers.includes(numberToAdd)) {
    await sendWhatsAppMessage(from,
      `ℹ️ *Number already exists:* \`${numberToAdd}\`\n✅ *यह नंबर पहले से लिस्ट में है*`
    );
    return res.sendStatus(200);
  }

  allowedNumbers.push(numberToAdd);
  saveAllowedNumbers();
  await sendWhatsAppMessage(from,
    `✅ *Number added successfully!*\n📞 \`${numberToAdd}\` \n\n📌 *अब यह नंबर अनुमति सूची में है*`
  );
  return res.sendStatus(200);
}


// ➖ REMOVE NUMBER
if (cleanedMessage.startsWith('remove')) {
  const parts = cleanedMessage.split(' ');
  const numberToRemove = parts[1];

  if (!numberToRemove) {
await sendWhatsAppMessage(from,
      `ℹ️ *Usage | उपयोग:* \`remove <number>\`\n📌 Example: \`remove 919876543210\`\n\n🔴 *Removes number from admin list*`
    );
    return res.sendStatus(200);
  }

  if (!allowedNumbers.includes(numberToRemove)) {
    await sendWhatsAppMessage(from,
      `⚠️ *Number not found in list:* \`${numberToRemove}\`\n🚫 *यह नंबर सूची में नहीं है*`
    );
    return res.sendStatus(200);
  }

  await sendWhatsAppMessage(from,
    `⚠️ *Confirm removal required:*\n\n🗑️ Reply with:\n\`confirm remove ${numberToRemove}\`\n\n⚠️ *पुष्टि के लिए ऊपर दिया गया मैसेज भेजें*`
  );
  return res.sendStatus(200);
}


    // ✅ CONFIRM REMOVE
if (cleanedMessage.startsWith('confirm remove')) {
  const parts = cleanedMessage.split(' ');
  const numberToRemove = parts[2];

  if (!numberToRemove) {
    await sendWhatsAppMessage(from,
      `❗ *Invalid confirmation format.*\n📝 Use: \`confirm remove <number>\`\nExample: \`confirm remove 919876543210\``
    );
    return res.sendStatus(200);
  }

  if (!allowedNumbers.includes(numberToRemove)) {
    await sendWhatsAppMessage(from,
      `⚠️ *Number not found in list:* \`${numberToRemove}\`\n🚫 *यह नंबर सूची में मौजूद नहीं है*`
    );
    return res.sendStatus(200);
  }

  allowedNumbers = allowedNumbers.filter(num => num !== numberToRemove);
  saveAllowedNumbers();
  await sendWhatsAppMessage(from,
    `🗑️ *Number removed successfully:*\n📞 \`${numberToRemove}\`\n\n❎ *यह नंबर अब अनुमति सूची से हटा दिया गया है*`
  );
  return res.sendStatus(200);
}

    // 📃 LIST ALL ALLOWED NUMBERS
    if (cleanedMessage === 'list') {
      if (allowedNumbers.length === 0) {
        await sendWhatsAppMessage(from, `📃 No numbers in allowed list.`);
      } else {
        let chunks = [];
        let currentChunk = "";
        allowedNumbers.forEach((num, i) => {
          const line = `${i + 1}. ${num}\n`;
          if ((currentChunk + line).length >= 3900) {
            chunks.push(currentChunk);
            currentChunk = "";
          }
          currentChunk += line;
        });
        if (currentChunk) chunks.push(currentChunk);
        for (let i = 0; i < chunks.length; i++) {
          await sendWhatsAppMessage(from, `📃 *Allowed Numbers (Page ${i + 1}/${chunks.length}):*\n\n${chunks[i]}`);
        }
      }
      return res.sendStatus(200);
    }
  }
  }

  const goodsKeywords = [
    'ajwain', 'aluminium section', 'angel channel', 'pati', 'battery scrap',
    'cement', 'chaddar', 'churi', 'coil', 'sheet', 'drum', 'finish goods','Paper scrap','shutter material',
    'haldi', 'iron scrap', 'metal scrap', 'ms plates', 'ms scrap', 'oil', 'tarafa',
    'pipe', 'plastic dana', 'plastic scrap', 'rubber scrap', 'powder',
    'raddi', 'pushta scrap', 'rolling scrap', 'steel', 'sugar', 'tmt bar',
    'tubes', 'tyre', 'scrap', 'dana', 'battery', 'aluminium', 'angel',
    'finish', 'plastic', 'plates', 'ms', 'rubber', 'pushta', 'rolling',
    'tmt', 'bar','oha','pusta'
  ];

  if (goodsKeywords.some(good => cleanedMessage.includes(good))) {
    if (!allowedNumbers.includes(from)) {
      console.log("🚫 Number not allowed:", from);
      return res.sendStatus(200);
    }

    if (!(await isStructuredLR(cleanedMessage))) {
      console.log("⚠️ Ignored message (not LR structured):", message);
      await sendWhatsAppMessage(
        ADMIN_NUMBER,
        `⚠️ Ignored unstructured LR from ${from}\n\n*Message:* ${message}`
      );
      return res.sendStatus(200);
    }

    const extracted =await extractDetails(cleanedMessage);
    const timeNow = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateNow = new Date().toLocaleDateString('en-IN');
    const lrData = {
      ...extracted,
      time: timeNow,
      date: dateNow
    };

    try {
      const pdfPath = await generatePDFWithTemplate(currentTemplate, lrData, message);
      await sendPDF(from, pdfPath, currentTemplate, message, lrData.truckNumber);
      logToExcel({
        Date: dateNow,
        Time: timeNow,
        'Truck No': lrData.truckNumber,
        From: lrData.from,
        To: lrData.to,
        Weight: lrData.weight,
        Description: lrData.description,
        Template:currentTemplate,
        Mobile:from
      });
    } catch (err) {
      console.error("❌ PDF Error:", err.message);
      await sendWhatsAppMessage(ADMIN_NUMBER, `❌ Failed to generate/send PDF for ${from}`);
    }

    if (!sentNumbers.includes(from)) sentNumbers.push(from);
  }

  res.sendStatus(200);
});

app.get('/sent-numbers', (req, res) => {
  res.json({ sentNumbers });
});

const PORT = process.env.PORT ||8080 ;
app.listen(PORT, () => {
  console.log(`✅ Webhook server running on http://localhost:${PORT}`);
});

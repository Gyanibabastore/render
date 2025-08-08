const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

async function sendPDF(to, filePath, templateNumber = null, originalMessage = '', truckNumber = null) {
  const adminNumber = process.env.ADMIN_NUMBER;

  try {
    console.log("📤 Sending PDF to:", to);

    // 📁 Generate a safe file name
    const fileName = `${truckNumber || 'LR'}.pdf`;
    const tempDir = path.join(__dirname, 'temp');
    const renamedPath = path.join(tempDir, fileName);

    fs.mkdirSync(tempDir, { recursive: true });
    fs.copyFileSync(filePath, renamedPath);

    // Upload PDF once
    const form = new FormData();
    form.append('file', fs.createReadStream(renamedPath));
    form.append('type', 'application/pdf');
    form.append('messaging_product', 'whatsapp');

    const uploadRes = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          ...form.getHeaders(),
        },
      }
    );

    const mediaId = uploadRes.data.id;
    console.log("📎 Media uploaded. ID:", mediaId);

    // 1️⃣ Send to the person who messaged → only Date
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: {
          id: mediaId,
          caption: `\nDate: ${new Date().toLocaleDateString()}`,
          filename: fileName,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log("✅ PDF sent to user:", to);

    // 2️⃣ Send to admin and extra users → full details
    const extraRecipients = [
      adminNumber,
      "918103061906",
      "918983641826"
    ].filter(Boolean);

    for (const number of extraRecipients) {
      await axios.post(
        `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: number,
          type: "document",
          document: {
            id: mediaId,
            caption: `📄 Rudransh Trading LR
Template: ${templateNumber}
Mobile: ${to}
Date: ${new Date().toLocaleDateString()}

📝 ${originalMessage}`,
            filename: fileName,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log(`✅ PDF sent to admin/extra: ${number}`);
    }

    // 🧹 Cleanup
    fs.unlinkSync(renamedPath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🗑️ Deleted original generated PDF:", filePath);
    }

  } catch (err) {
    const errorMessage = err.response?.data?.error?.message || err.message;
    console.error("❌ Error sending PDF:", errorMessage);

    // Notify admin on failure
    if (adminNumber) {
      const failMsg = `❌ *PDF failed to send*\nTo: ${to}\nReason: ${errorMessage}\n\n📝 ${originalMessage}`;
      await axios.post(
        `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: adminNumber,
          text: { body: failMsg },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
    }
  }
}

module.exports = sendPDF;

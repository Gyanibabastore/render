const dotenv = require("dotenv");
dotenv.config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

// Create Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractDetails(message) {
  console.log("📩 Received Message:", message);

  const prompt = `
You are a smart logistics parser.

Extract the following **mandatory** details from this message:

- truckNumber (which may be 9 or 10 characters long, possibly containing spaces or hyphens)
- to
- weight
- description

Also, extract the **optional** field:
- from (this is optional but often present)

If truckNumber is missing, but the message contains words like "brllgada","bellgade","bellgad","bellgadi","new truck", "new tractor", or "new gadi", 
then set truckNumber to that phrase (exactly as it appears).

If the weight contains the word "fix" or similar, preserve it as-is.

Here is the message:
"${message}"

Return the extracted information strictly in the following JSON format:

{
  "truckNumber": "",    // mandatory
  "from": "",           // optional
  "to": "",             // mandatory
  "weight": "",         // mandatory
  "description": ""     // mandatory
}

If any field is missing, return it as an empty string.

Ensure the output is only the raw JSON — no extra text, notes, or formatting outside the JSON structure.
`;

  try {
    console.log("⏳ Sending prompt to Gemini...");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let resultText = response.text();

    console.log("📤 Raw Response from Gemini:\n", resultText);

    // 🧼 Remove Markdown/code block formatting
    resultText = resultText.trim();
    if (resultText.startsWith("```")) {
      resultText = resultText.replace(/```(?:json)?/g, "").trim();
    }

    let extracted = {};
    try {
      extracted = JSON.parse(resultText);
      console.log("✅ Parsed JSON:", extracted);
    } catch (parseErr) {
      console.error("❌ JSON Parse Error:", parseErr.message);
      return {
        truckNumber: "",
        from: "",
        to: "",
        weight: "",
        description: ""
      };
    }

    // If truckNumber is empty, look for "new truck", "new tractor", or "new gadi" in original message
    if (!extracted.truckNumber) {
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes("new truck")) extracted.truckNumber = "new truck";
      else if (lowerMsg.includes("new tractor")) extracted.truckNumber = "new tractor";
      else if (lowerMsg.includes("new gadi")) extracted.truckNumber = "new gadi";
      else if (lowerMsg.includes("bellgadi")) extracted.truckNumber = "bellgadi";
      else if (lowerMsg.includes("bellgada")) extracted.truckNumber = "bellgada";
      else if (lowerMsg.includes("bellgade")) extracted.truckNumber = "bellgade";
      else if (lowerMsg.includes("bellgad")) extracted.truckNumber = "bellgad";
 
    }

    // Normalize truckNumber if it's NOT one of the special phrases
    if (extracted.truckNumber && !["new truck", "new tractor", "new gadi"].includes(extracted.truckNumber.toLowerCase())) {
      extracted.truckNumber = extracted.truckNumber
        .replace(/[\s.-]/g, "")  // remove spaces, dots, hyphens
        .toUpperCase();

    }
    // Capitalize helper
    const capitalize = (str) => {
      if (!str) return "";
      return str
        .toLowerCase()
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    };

    // Capitalize from & to & description
    if (extracted.from) extracted.from = capitalize(extracted.from);
    if (extracted.to) extracted.to = capitalize(extracted.to);
    if (extracted.description) extracted.description = capitalize(extracted.description);

    // Weight: if weight contains "fix" (case insensitive), keep as-is, else convert as number
    if (extracted.weight) {
      if (/fix/i.test(extracted.weight)) {
        // keep weight as is
        extracted.weight = extracted.weight.trim();
      } else {
        let weightNum = parseFloat(extracted.weight);
        if (!isNaN(weightNum)) {
          if (weightNum > 0 && weightNum < 100) {
            extracted.weight = Math.round(weightNum * 1000).toString();
          } else {
            extracted.weight = Math.round(weightNum).toString();
          }
        }
      }
    }
    
    return extracted;

  } catch (error) {
    console.error("❌ Error in extractDetails:", error.message);
    
  }
}

async function isStructuredLR(message) {
  console.log("\n🔍 Checking if message is structured LR...");
  const d = await extractDetails(message);

  if (!d.truckNumber) console.log("❌ Missing Truck Number");
  if (!d.to) console.log("❌ Missing TO Location");
  if (!d.weight) console.log("❌ Missing Weight");
  if (!d.description) console.log("❌ Missing Description");

  const isValid = d.truckNumber && d.to && d.weight && d.description;
  console.log("✅ isStructuredLR:", isValid);
  return isValid;
}

module.exports = { extractDetails, isStructuredLR };

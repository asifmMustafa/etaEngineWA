const { default: axios } = require("axios");
const { storeImage } = require("../db/models/image");
const { generateRandomId } = require("../utilities");
const { catchError } = require("./errorHandler");
const { getMenuMessage } = require("../db/models/snapshotListeners");
require("dotenv").config();

const MAX_MESSAGE_LENGTH = 4096;

const sendMessage = async (chat_id, phone_id, message) => {
  try {
    // Split the message into multiple parts if it's too long for a single message
    let messageParts = [];
    while (message.length > 0) {
      const part = message.slice(0, MAX_MESSAGE_LENGTH);
      messageParts.push(part);
      message = message.slice(MAX_MESSAGE_LENGTH);
    }

    let lastMessageId;
    for (const part of messageParts) {
      const res = await axios.post(
        `https://graph.facebook.com/v16.0/${phone_id}/messages?access_token=${process.env.TOKEN}`,
        {
          messaging_product: "whatsapp",
          to: chat_id,
          type: "text",
          text: {
            body: part,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      lastMessageId = res.data.messages[0].id;
    }

    return lastMessageId;
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error sending message");
  }
};

const getImage = async (image_id, chat_id) => {
  try {
    // First axios call to get the image URL
    const result = await axios.get(
      `https://graph.facebook.com/v18.0/${image_id}/`,
      {
        headers: {
          Authorization: `Bearer ${process.env.TOKEN}`,
        },
      }
    );

    // Second axios call to get the image content
    const response = await axios({
      method: "get",
      url: result.data.url,
      headers: {
        Authorization: `Bearer ${process.env.TOKEN}`,
      },
      responseType: "arraybuffer", // Change this to 'arraybuffer' to get data in buffer format
    });

    // Store in a buffer
    const imageBuffer = Buffer.from(response.data);

    const link = await storeImage(chat_id, imageBuffer, generateRandomId(10));
    return link;
  } catch (error) {
    catchError(error);
    console.error("Error:", error);
  }
};

const sendPhoto = async (chat_id, phone_id, imgLink, caption) => {
  try {
    console.log("sending pic");
    const res = await axios.post(
      `https://graph.facebook.com/v16.0/${phone_id}/messages?access_token=${process.env.TOKEN}`,
      {
        messaging_product: "whatsapp",
        to: chat_id,
        type: "image",
        image: {
          link: imgLink,
          caption: caption,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    console.log(res);
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error sending image");
  }
};

const sendFile = async (chat_id, phone_id, documentLink, caption) => {
  try {
    console.log("sending document");
    const res = await axios.post(
      `https://graph.facebook.com/v16.0/${phone_id}/messages?access_token=${process.env.TOKEN}`,
      {
        messaging_product: "whatsapp",
        to: chat_id,
        type: "document",
        document: {
          link: documentLink,
          caption: caption,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    return res.data.messages[0].id;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error sending document");
  }
};

const sendMenuMessage = async (chat_id, phone_id, language = "english") => {
  const text = `${
    getMenuMessage().bot_replies.menu[language]
  }\n\n1. ChatGPT 🗣\n2. Generate Image 🖼️\n3. Solve my assignment\n4. Help me understand\n5. Be my Girlfriend/Boyfriend 👩‍❤️‍💋‍👨\n${
    language == "english" ? "6. Change to বাংলা" : "6. Change to English"
  }`;

  await sendMessage(chat_id, phone_id, text);
};

module.exports = {
  sendMessage,
  sendMenuMessage,
  sendPhoto,
  sendFile,
  getImage,
};

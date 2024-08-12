const { sendMessage } = require("./bot/botUtilities");
const {
  handleMessage,
  handleImage,
  handleDocument,
} = require("./bot/messageHandler");
const { updateQueueUser, getUserData } = require("./db/models/user");
require("dotenv").config();
const { app, catchError } = require("./bot/errorHandler");
const { getMessagesWhisperBridge } = require("./db/models/snapshotListeners");

//Array to store chat_id of user that has ongoing process
let generating = [];

app.listen(process.env.PORT, () => {
  console.log(`Webhook is listening on port ${process.env.PORT}`);
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = req.query["hub.verify_token"];

  if (mode && verifyToken) {
    if (mode === "subscribe" && verifyToken === "pizza") {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post("/webhook", (req, res) => {
  try {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      body.entry.forEach(async (entry) => {
        entry.changes.forEach(async (change) => {
          if (change.field === "messages") {
            const messageData = change.value;
            if (
              messageData &&
              Array.isArray(messageData.messages) &&
              messageData.messages.length > 0
            ) {
              //Incoming Message
              const phone_id = messageData.metadata.phone_number_id;
              const chat_id = messageData.messages[0].from;
              const message = messageData?.messages[0]?.text?.body;
              const messageType = messageData.messages[0].type;

              const countryCallingCode = chat_id.substring(0, 3);
              const isUserAllowed = countryCallingCode == "880";

              if (!isUserAllowed) return;

              await sendMessage(chat_id, phone_id, `⏳⏳⏳`);

              if (generating.includes(chat_id)) {
                const user = await getUserData(chat_id);
                let language = user.language || "english";

                await sendMessage(
                  chat_id,
                  phone_id,
                  getMessagesWhisperBridge().bot_replies.multitasking_error[
                    language
                  ]
                );
                return;
              }
              generating.push(chat_id);

              //Response Logic here
              if (messageType == "text") {
                console.log(`${chat_id}: ${message}`);
                await handleMessage(chat_id, phone_id, message);
              } else if (messageType == "image") {
                await handleImage(
                  chat_id,
                  phone_id,
                  message,
                  messageData?.messages[0]
                );
              } else if (messageType == "document") {
                await handleDocument(
                  chat_id,
                  phone_id,
                  message,
                  messageData?.messages[0]
                );
              }

              await updateQueueUser(chat_id);
              generating = generating.filter((item) => item !== chat_id);
            }
          }
        });
      });
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
  }
});

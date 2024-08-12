const { sendMessage } = require("./bot/botUtilities");
const {
  handleMessage,
  handleImage,
  handleDocument,
} = require("./bot/messageHandler");
const { updateQueueUser } = require("./db/models/user");
require("dotenv").config();
const { app, catchError } = require("./bot/errorHandler");

app.listen(process.env.PORT, () => {
  console.log(`EtaEngineWA is running on port ${process.env.PORT}.`);
});

app.post("/process_request", async (req, res) => {
  const messageData = req.body;
  const phone_id = messageData.metadata.phone_number_id;
  const chat_id = messageData.messages[0].from;
  const message = messageData?.messages[0]?.text?.body;
  const messageType = messageData.messages[0].type;

  try {
    console.log(messageData.messages);

    //Response Logic here
    if (messageType == "text") {
      await handleMessage(chat_id, phone_id, message);
    } else if (messageType == "image") {
      await handleImage(chat_id, phone_id, message, messageData?.messages[0]);
    } else if (messageType == "document") {
      await handleDocument(
        chat_id,
        phone_id,
        message,
        messageData?.messages[0]
      );
    }

    await updateQueueUser(chat_id);

    res.json({ status: "ok", message: "Processed." });
  } catch (err) {
    catchError(err);
    console.log(err.message);
    // await sendMessage(
    //   chat_id,
    //   phone_id,
    //   "Sorry, there was an error processing your request. Please try again later."
    // );

    res.json({ status: "ok", message: "Processed." });
  }
});

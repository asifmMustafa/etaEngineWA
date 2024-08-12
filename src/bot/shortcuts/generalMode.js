require("dotenv").config();
const { increment } = require("firebase/firestore");
const { updateShortcutCount } = require("../../db/models/globalData");
const { resetContext, addToContext } = require("../../db/models/message");
const { addQueueUser } = require("../../db/models/user");
const { generateResponse } = require("../../openai/chatgpt");
const {
  containsBangla,
  translateText,
  contextHasExceeded,
} = require("../../utilities");
const { sendMessage, sendMenuMessage } = require("../botUtilities");
const { catchError } = require("../errorHandler");
const { getMessages } = require("../../db/models/snapshotListeners");

let BOT_REPLIES = {};

const generalMode = async (chat_id, phone_id, user, text) => {
  try {
    BOT_REPLIES = getMessages().bot_replies;
    let language = user.language || "english";

    console.log(user.step);
    switch (user.step) {
      case 0:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.general_mode_prompt_query[language]
        );
        await addQueueUser(chat_id, { step: 1, mode: "general" });
        await updateShortcutCount(chat_id, `general`, user.userType);
        return;
      case 1:
        let context = [];
        if (user.context) {
          context = user.context;
        }
        context.push({ role: "user", content: text });
        const response = await generateResponse(
          context,
          process.env.GPT_MODEL_3,
          chat_id,
          user.userType
        );

        if (!response) {
          await sendMessage(
            chat_id,
            phone_id,
            BOT_REPLIES.gpt_failed[language]
          );
          await sendMenuMessage(chat_id, phone_id, language);
          await addQueueUser(chat_id, { mode: "menu", step: 0 });
          return;
        }

        await addQueueUser(chat_id, {
          currentContextCost: increment(response.cost),
        });

        let finalResponse = response.text;

        if (containsBangla(text) || language == "bangla") {
          finalResponse = await translateText(response.text, "bn");
        }
        await sendMessage(chat_id, phone_id, finalResponse);

        if (contextHasExceeded(user, response)) {
          await sendMessage(
            chat_id,
            phone_id,
            BOT_REPLIES.context_reset[language]
          );
          await resetContext(chat_id);
        } else {
          context.push({ role: "assistant", content: response.text });
          await addToContext(chat_id, context);
          await addQueueUser(chat_id, {
            currentContextCost: increment(response.cost),
          });
        }
        return;
    }
  } catch (err) {
    await resetContext(chat_id);
    catchError(err);
    console.log(err.message);
    console.log("Error in general mode");
  }
};

module.exports = { generalMode };

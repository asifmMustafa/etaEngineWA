require("dotenv").config();
const { increment } = require("firebase/firestore");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  addMessageToContext,
  addResponseToContext,
  resetContext,
  addToContext,
} = require("../../db/models/message");
const { addQueueUser } = require("../../db/models/user");
const { generateResponse } = require("../../openai/chatgpt");
const { sendMessage, sendMenuMessage } = require("../botUtilities");
const { catchError } = require("../errorHandler");
const { getMessages } = require("../../db/models/snapshotListeners");
const { translateText } = require("../../utilities");

let BOT_REPLIES = {};
let PROMPTS = {};

const help_me_understand = async (chat_id, phone_id, user, text) => {
  try {
    const messages = getMessages();
    BOT_REPLIES = messages.bot_replies;
    PROMPTS = messages.prompts;
    let language = user.language || "english";

    console.log(user.step);
    let context = [];
    switch (user.step) {
      case 0:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.help_me_understand_topic_query[language]
        );
        await addQueueUser(chat_id, {
          mode: "help_me_understand",
          step: 1,
          context: [
            {
              role: `system`,
              content: PROMPTS.help_me_understand_system,
            },
          ],
        });

        await updateShortcutCount(chat_id, `help_me_understand`, user.userType);
        return;
      case 1:
        if (user.context) {
          context = user.context;
        }
        context.push({
          role: "user",
          content: PROMPTS.help_me_understand_prefix.replace("{PROMPT}", text),
        });
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

        if (language == "bangla") {
          const translated_text = await translateText(response.text, "bn");
          await sendMessage(chat_id, phone_id, translated_text);
        } else {
          await sendMessage(chat_id, phone_id, response.text);
        }

        context.push({
          role: "assistant",
          content: response.text,
        });
        await addToContext(chat_id, context);
        await addQueueUser(chat_id, {
          mode: "general",
          step: 1,
          currentContextCost: increment(response.cost),
        });
        return;
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in essay/article mode");
  }
};

module.exports = { help_me_understand };

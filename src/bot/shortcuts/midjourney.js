const Midjourney = require("midjourney");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  addMessageToContext,
  addResponseToContext,
  resetContext,
  addToContext,
} = require("../../db/models/message");
const { addQueueUser } = require("../../db/models/user");
const { generateResponse } = require("../../openai/chatgpt");
const {
  sendMessage,
  sendPhoto,
  sendFile,
  sendMenuMessage,
} = require("../botUtilities");

const Jimp = require("jimp");
const { storeImage } = require("../../db/models/image");
const { default: axios } = require("axios");
const { catchError } = require("../errorHandler");
const { timeout, pollTaskStatus } = require("../../utilities");
const { getMessages } = require("../../db/models/snapshotListeners");

let BOT_REPLIES = {};

const midjourney = async (chat_id, phone_id, user, text) => {
  try {
    BOT_REPLIES = getMessages().bot_replies;
    let language = user.language || "english";

    const response = await axios.post(
      `${process.env.MJ_QUEUE_URL}/checkIsQueued`,
      {
        chat_id: chat_id,
      }
    );

    if (response.data.isQueued && user.step != 2) {
      if (response.data.position !== -1)
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.queue_postion[language].replace(
            "{POS}",
            response.data.position + 1
          )
        );
      await sendMessage(
        chat_id,
        phone_id,
        BOT_REPLIES.image_generation_already_in_queue[language]
      );
      await sendMenuMessage(chat_id, phone_id, language);
      return;
    }

    switch (user.step) {
      case 0:
        await addQueueUser(chat_id, { mode: "midjourney", step: 1 });
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.image_generation_prompt_query[language]
        );
        await updateShortcutCount(chat_id, `midjourney`, user.userType);
        // await sendPhoto(
        //   chat_id,
        //   phone_id,
        //   `https://firebasestorage.googleapis.com/v0/b/etagpt-b13e6.appspot.com/o/8801766314331%2F1.png?alt=media&token=c8b51e3d-efb1-47f5-a563-43fd5af82f82`,
        //   `main`
        // );
        return;
      case 1:
        // const img = await midjourneyImagine(text, chat_id, phone_id);
        const img = await axios.post(`${process.env.MJ_QUEUE_URL}/api`, {
          chat_id: chat_id,
          phone_id: phone_id,
          type: "imagine",
          platform: "wa",
          text: text,
        });
        console.log(img.data);
        if (img.data.queued) {
          await sendMessage(
            chat_id,
            phone_id,
            BOT_REPLIES.image_generation_request_queued[language].replace(
              "{QUEUE_POS}",
              img.data.inLine
            )
          );
          await addQueueUser(chat_id, { step: 0, mode: "menu" });
          await sendMenuMessage(chat_id, phone_id, language);
        } else {
          console.log("Response:", img.data);

          await addQueueUser(chat_id, { step: 2 });
        }

        return;
      case 2:
        await addQueueUser(chat_id, { step: 0, mode: "menu" });
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.image_generation_multitask[language]
        );
        await sendMenuMessage(chat_id, phone_id, language);
        return;
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in midjourney mode");
  }
};

function removeWords(str) {
  return str.replace(/(--fast|--relax|--turbo)/g, "").trim();
}

module.exports = { midjourney };

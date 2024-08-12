const { default: axios } = require("axios");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  addMessageToContext,
  addResponseToContext,
  resetContext,
  addToContext,
} = require("../../db/models/message");
const { addQueueUser } = require("../../db/models/user");
const { generateResponse } = require("../../openai/chatgpt");
const { sendMessage, getImage, sendMenuMessage } = require("../botUtilities");
const { timeout, pollTaskStatus } = require("../../utilities");
const { catchError } = require("../errorHandler");
const { getMessages } = require("../../db/models/snapshotListeners");

let BOT_REPLIES = {};

const aiPortrait = async (chat_id, phone_id, user, text) => {
  try {
    BOT_REPLIES = getMessages().bot_replies;
    let language = user.language || "english";

    const response = await axios.post(
      `${process.env.MJ_QUEUE_URL}/checkIsQueued`,
      {
        chat_id: chat_id,
      }
    );

    if (response.data.isQueued && user.step != 4) {
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
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.ai_portrait_character_selection[language]
        );
        await addQueueUser(chat_id, {
          mode: "aiPortrait",
          step: 1,
        });

        await updateShortcutCount(chat_id, `aiPortrait`, user.userType);
        return;
      case 1:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.ai_portrait_environment_selection[language]
        );

        await addQueueUser(chat_id, {
          mode: "aiPortrait",
          step: 2,
          followUpStore: text,
        });
        return;
      case 2:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.ai_portrait_picture_upload[language]
        );
        await addQueueUser(chat_id, {
          mode: "aiPortrait",
          followUpStore2: text,
          step: 3,
        });
        return;
      case 3:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.ai_portrait_picture_upload[language]
        );
        return;
      case 4:
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
    console.log("Error in aiPortrait mode");
  }
};

const aiPortraitImage = async (chat_id, phone_id, user, text, messageData) => {
  BOT_REPLIES = getMessages().bot_replies;
  let language = user.language || "english";

  switch (user.step) {
    case 3:
      console.log("got img");
      console.log(messageData);
      const img = await getImage(messageData.image.id, chat_id);
      const isSingleFace = await getFaceCount(img);
      if (!isSingleFace) {
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.ai_portrait_multiple_face[language]
        );
        return;
      }
      const response = await axios.post(`${process.env.MJ_QUEUE_URL}/api`, {
        text: getMessages()
          .prompts.ai_portrait_prefix.replace("{CHARACTER}", user.followUpStore)
          .replace("{ENVIRONMENT}", user.followUpStore2),
        chat_id: chat_id,
        phone_id: phone_id,
        type: "imagineFace",
        img: img,
        platform: "wa",
      });

      if (response.data.queued) {
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.image_generation_request_queued[language].replace(
            "{QUEUE_POS}",
            response.data.inLine
          )
        );
        await addQueueUser(chat_id, { step: 0, mode: "menu" });
        await sendMenuMessage(chat_id, phone_id, language);
      } else {
        console.log("Response:", response.data);

        await addQueueUser(chat_id, { step: 4 });
      }
      return;
    default:
      await sendMessage(
        chat_id,
        phone_id,
        BOT_REPLIES.only_text_allowed[language]
      );
  }
};

const getFaceCount = async (link) => {
  try {
    const postData = {
      img1_url: link,
    };

    const response = await axios({
      url: "https://face.etagpt.io/count_faces",
      method: "post",
      data: postData,
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (response.status == 200) {
      return true;
    }
  } catch (err) {
    console.log(err);
  }
};

module.exports = { aiPortrait, aiPortraitImage };

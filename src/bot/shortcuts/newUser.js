const { updateTotalUserJoined } = require("../../db/models/globalData");
const { getMessages } = require("../../db/models/snapshotListeners");
const { addNewUser, updateUser } = require("../../db/models/user");
const { sendMessage, sendMenuMessage } = require("../botUtilities");
const { catchError } = require("../errorHandler");

let BOT_REPLIES = {};

const createNewUser = async (chat_id, phone_id, user, text) => {
  BOT_REPLIES = getMessages().bot_replies;
  let language = user.language || "english";

  if (!text && user.step != 0) {
    await sendMessage(
      chat_id,
      phone_id,
      BOT_REPLIES.only_text_allowed[language]
    );
    return;
  }

  try {
    console.log(user);
    switch (user.step) {
      case 0:
        await addNewUser(chat_id);
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.new_user_welcome[language]
        );
        break;
      case 1:
        await updateUser(chat_id, { name: text, step: 2 });
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.new_user_age_query[language]
        );
        break;
      case 2:
        if (isNaN(parseFloat(text))) {
          await sendMessage(
            chat_id,
            phone_id,
            BOT_REPLIES.only_number_allowed[language]
          );
          return;
        }
        let ageGroup = 0;
        if (parseInt(text) <= 20) {
          ageGroup = 1;
        } else if (parseInt(text) >= 21 && parseInt(text) <= 25) {
          ageGroup = 2;
        } else if (parseInt(text) > 25 && parseInt(text) <= 35) {
          ageGroup = 3;
        } else if (parseInt(text) > 35) {
          ageGroup = 4;
        }
        await updateUser(chat_id, {
          age: parseInt(text),
          step: 0,
          mode: "menu",
          ageGroup: ageGroup,
          premium: false,
        });
        await updateTotalUserJoined();
        await sendMenuMessage(chat_id, phone_id, language);
        break;
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in new user mode");
  }
};

module.exports = { createNewUser };

const { resetContext } = require("../db/models/message");
const { handleSession } = require("../db/models/session");
const { getUserData, addQueueUser } = require("../db/models/user");
const { sendMenuMessage, sendMessage } = require("./botUtilities");
const { aiPortrait, aiPortraitImage } = require("./shortcuts/aiPortrait");
const { etaSearch } = require("./shortcuts/etaSearch");
const { generalMode } = require("./shortcuts/generalMode");
const { gfbf } = require("./shortcuts/gfbf");
const { help_me_understand } = require("./shortcuts/help_me_understand");
const { midjourney } = require("./shortcuts/midjourney");
const { createNewUser } = require("./shortcuts/newUser");
const {
  assignmentHelpImage,
  assignmentHelp,
} = require("./shortcuts/assignmentHelp");
const { catchError } = require("./errorHandler");
const {
  getShortcutsMaintenanceStatus,
  getMessages,
} = require("../db/models/snapshotListeners");
const { translateText, containsBangla } = require("../utilities");
const { deleteField } = require("firebase/firestore");

const updateText =
  "👋 Hello etaGPT explorers!\n\n" +
  "💻 We've been at work behind the scenes, and we're excited to announce the arrival of etaGPT beta 0.3.\n\n" +
  "👉 With this update, we're introducing new features designed to make your experience even better. Now, you can effortlessly solve assignments, create portraits with your favorite characters, or even swap faces with your beloved celebrities. We've got it all covered!\n\n" +
  "👉 Stay tuned for more updates and enjoy exploring the latest version of etaGPT. Thank you for your continued support!\n\n" +
  "Best regards,\n" +
  "The etaGPT Team";

const shortcuts = [
  "general",
  "midjourney",
  "aiPortrait",
  "assignmentHelp",
  "etaSearch",
  "help_me_understand",
  "gfbf",
];

const handleMessage = async (chat_id, phone_id, message) => {
  try {
    const user = await getUserData(chat_id);
    let language = user.language || "english";

    //If it is a new user
    if (!user) {
      catchError(new Error("Database Error"));
      return;
    } else if (user == "NOT FOUND") {
      createNewUser(chat_id, phone_id, { step: 0 });
      return;
    }

    await handleSession(chat_id, user);

    if (message == "/premium") {
      addQueueUser(chat_id, { premium: true, mode: "menu", step: 0 });
      await sendMessage(chat_id, phone_id, `You are now a premium user.`);
      await sendMenuMessage(chat_id, phone_id, user.language || "english");
      return;
    }

    if (message == "/trial") {
      addQueueUser(chat_id, { premium: false, mode: "menu", step: 0 });
      await sendMessage(chat_id, phone_id, `You are now a trial user.`);
      await sendMenuMessage(chat_id, phone_id, user.language || "english");
      return;
    }

    if (message == "/reset") {
      addQueueUser(chat_id, {
        gfbf_message_count: deleteField(),
        gfbf_last_used: deleteField(),
        assignmentHelp: 0,
        assignment_help_monthly_count: deleteField(),
        mode: "menu",
        step: 0,
      });
      await sendMessage(
        chat_id,
        phone_id,
        `Assignment help and gfbf message counts have been reset.`
      );
      await sendMenuMessage(chat_id, phone_id, user.language || "english");
      return;
    }

    const menuStrings = ["menu", "MENU", "Menu", "/menu"];

    //If user requests the menu
    if (user.mode != `registration` && menuStrings.includes(message)) {
      await sendMenuMessage(chat_id, phone_id, language);
      await addQueueUser(chat_id, { step: 0, mode: "menu" });
      await resetContext(chat_id);
      return;
    }

    let shortcut = user.mode;
    const shortcutsMaintenanceStatus = getShortcutsMaintenanceStatus();

    if (user.mode === "menu") {
      shortcut = shortcuts[parseInt(message) - 1];
    }

    if (shortcutsMaintenanceStatus[shortcut]) {
      await addQueueUser(chat_id, { mode: "menu", step: 0 });
      await sendMessage(
        chat_id,
        phone_id,
        getMessages().bot_replies.shortcut_maintenance_mode[language]
      );
      await sendMenuMessage(chat_id, phone_id, language);
      return;
    }

    if (user.language == "bangla" && containsBangla(message)) {
      message = await translateText(message, "en");
    }

    //shortcuts
    switch (user.mode) {
      case "registration":
        await createNewUser(chat_id, phone_id, user, message);
        break;
      case "update_0.2":
        await sendMessage(chat_id, phone_id, updateText);
        await sendMenuMessage(chat_id, phone_id, language);
        await addQueueUser(chat_id, { step: 0, mode: "menu" });
        return;
      case "menu":
        if (message == 1) {
          await generalMode(chat_id, phone_id, user, message);
        } else if (message == 2) {
          await midjourney(chat_id, phone_id, user, message);
        } else if (message == 3) {
          await assignmentHelp(chat_id, phone_id, user, message);
        } else if (message == 4) {
          await help_me_understand(chat_id, phone_id, user, message);
        } else if (message == 5) {
          await gfbf(chat_id, phone_id, user, message);
        } else if (message == 6) {
          if (!user.language || user.language == "english") {
            await addQueueUser(chat_id, { language: "bangla" });
            await sendMessage(chat_id, phone_id, "Language changed to Bangla");
            await sendMenuMessage(chat_id, phone_id, "bangla");
          } else {
            await addQueueUser(chat_id, { language: "english" });
            await sendMessage(chat_id, phone_id, "Language changed to English");
            await sendMenuMessage(chat_id, phone_id, "english");
          }
        } else {
          await sendMessage(
            chat_id,
            phone_id,
            getMessages().bot_replies.invalid_selection_message[language]
          );
        }
        break;
      case "general":
        await generalMode(chat_id, phone_id, user, message);
        break;
      case "aiPortrait":
        await aiPortrait(chat_id, phone_id, user, message);
        break;
      case "midjourney":
        await midjourney(chat_id, phone_id, user, message);
        break;
      case "help_me_understand":
        await help_me_understand(chat_id, phone_id, user, message);
        break;
      case "etaSearch":
        await etaSearch(chat_id, phone_id, user, message);
        break;
      case "gfbf":
        await gfbf(chat_id, phone_id, user, message);
        break;
      case "assignmentHelp":
        await assignmentHelp(chat_id, phone_id, user, message);
        break;
    }

    // await updateTopShortcut(chat_id, user);
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error handling message");
  }
};

const handleDocument = async (chat_id, phone_id, message, messageData) => {
  const user = await getUserData(chat_id);
  let language = user.language || "english";

  //If it is a new user
  if (!user) {
    catchError(new Error("Database Error"));
    return;
  } else if (user == "NOT FOUND") {
    createNewUser(chat_id, phone_id, { step: 0 });
    return;
  }

  const shortcutsMaintenanceStatus = getShortcutsMaintenanceStatus();

  if (shortcutsMaintenanceStatus[user.mode]) {
    await addQueueUser(chat_id, { mode: "menu", step: 0 });
    await sendMessage(
      chat_id,
      phone_id,
      getMessages().bot_replies.shortcut_maintenance_mode[language]
    );
    await sendMenuMessage(chat_id, phone_id, language);
    return;
  }

  switch (user.mode) {
    case "assignmentHelp":
      await sendMessage(
        chat_id,
        phone_id,
        getMessages().bot_replies.only_image_allowed[language]
      );
    default:
      await sendMessage(
        chat_id,
        phone_id,
        getMessages().bot_replies.document_not_allowed[language]
      );
  }

  await handleSession(chat_id, user);

  // await updateTopShortcut(chat_id, user);
};

const handleImage = async (chat_id, phone_id, message, messageData) => {
  const user = await getUserData(chat_id);
  let language = user.language || "english";

  //If it is a new user
  if (!user) {
    catchError(new Error("Database Error"));
    return;
  } else if (user == "NOT FOUND") {
    createNewUser(chat_id, phone_id, { step: 0 });
    return;
  }

  const shortcutsMaintenanceStatus = getShortcutsMaintenanceStatus();

  if (shortcutsMaintenanceStatus[user.mode]) {
    await addQueueUser(chat_id, { mode: "menu", step: 0 });
    await sendMessage(
      chat_id,
      phone_id,
      getMessages().bot_replies.shortcut_maintenance_mode[language]
    );
    await sendMenuMessage(chat_id, phone_id, language);
    return;
  }

  switch (user.mode) {
    case "aiPortrait":
      await aiPortraitImage(chat_id, phone_id, user, message, messageData);
      break;
    case "assignmentHelp":
      await assignmentHelpImage(chat_id, phone_id, user, message, messageData);
      break;
    default:
      await sendMessage(
        chat_id,
        phone_id,
        getMessages().bot_replies.image_not_allowed[[language]]
      );
  }

  await handleSession(chat_id, user);

  // await updateTopShortcut(chat_id, user);
};

module.exports = { handleMessage, handleImage, handleDocument };

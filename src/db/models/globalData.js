const {
  updateDoc,
  doc,
  increment,
  addDoc,
  collection,
} = require("firebase/firestore");
const { db } = require("../firebase");
const moment = require("moment-timezone");
const { addQueueUser } = require("./user");
const { catchError } = require("../../bot/errorHandler");

const updateShortcutCount = async (chat_id, shortcut, userType) => {
  const now = new Date(moment().tz("Asia/Dhaka"));
  try {
    let userObj = {};
    let dailyDataObj = {};
    userObj[shortcut] = increment(1);
    dailyDataObj[`shortcut_wa_${shortcut}`] = increment(1);
    await addQueueUser(chat_id, userObj);

    await addDoc(collection(db, "ShortcutUsage"), {
      chat_id: chat_id,
      platform: "wa",
      shortcut_name: shortcut,
      time: now,
      user_type: userType,
    });

    const date = moment().tz("Asia/Dhaka").format("YYYY-MM-DD");
    let shourtcutData = {};
    shourtcutData[`${shortcut}_wa_${userType}`] = increment(1);

    await updateDoc(doc(db, "ShortcutsDailyData", date), shourtcutData);
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error Updating Shortcut");
  }
};

const updateTotalUserJoined = async () => {
  let obj = {};
  obj[`TotalUsers`] = increment(1);
  obj[`JoinedToday`] = increment(1);
  const docRef = await updateDoc(doc(db, "GlobalData", "Whatsapp"), obj);
};

module.exports = { updateShortcutCount, updateTotalUserJoined };

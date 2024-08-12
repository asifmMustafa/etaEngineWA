const {
  addDoc,
  collection,
  updateDoc,
  doc,
  getFirestore,
  Timestamp,
  increment,
} = require("firebase/firestore");
const moment = require("moment-timezone");
const { db } = require("../firebase");
const { addQueueUser } = require("./user");
const { catchError } = require("../../bot/errorHandler");

const handleSession = async (chat_id, user) => {
  try {
    handleHourHostpotCount(chat_id, user);
    const now = new Date(moment().tz("Asia/Dhaka"));
    const timestamp = Timestamp.fromDate(
      new Date(moment().tz("Asia/Dhaka").toISOString())
    );

    let currentSession;
    if (!user.currentSession) {
      currentSession = "N/A";
    } else {
      currentSession = user.currentSession;
    }
    if (user.lastActive && user.currentSession) {
      if (getDifferenceInMinutes(timestamp, user.lastActive) > 60) {
        const currentSessionData = await addDoc(collection(db, "sessionsWA"), {
          lastActive: now,
          sessionCreated: now,
          age: user.age ? user.age : null,
          chat_id: chat_id,
          premium: user.premium ? user.premium : false,
        });
        currentSession = currentSessionData.id;
      } else {
        if (user.currentSession) {
          await updateDoc(doc(db, "sessionsWA", user.currentSession), {
            lastActive: now,
            age: user.age ? user.age : null,
            premium: user.premium ? user.premium : false,
          });
        }
      }
    } else {
      const currentSessionData = await addDoc(collection(db, "sessionsWA"), {
        lastActive: now,
        sessionCreated: now,
        age: user.age ? user.age : null,
        chat_id: chat_id,
        premium: user.premium ? user.premium : false,
      });
      currentSession = currentSessionData.id;
      console.log("written session");
    }

    await addQueueUser(chat_id, {
      currentSession: currentSession,
      premium: user.premium ? user.premium : false,
      lastActive: now,
    });
    console.log("written session");
  } catch (err) {
    catchError(err);
    console.log(err);
  }
};

const handleHourHostpotCount = async (chat_id, user) => {
  try {
    const now = moment().tz("Asia/Dhaka");
    const hour = parseInt(now.format("HH"));
    const formattedDate = now.format("YYYY-MM-DD");

    let slot = "";
    if (hour >= 0 && hour < 4) {
      slot = "00:00-04:00";
    } else if (hour >= 4 && hour < 8) {
      slot = "04:00-08:00";
    } else if (hour >= 8 && hour < 12) {
      slot = "08:00-12:00";
    } else if (hour >= 12 && hour < 16) {
      slot = "12:00-16:00";
    } else if (hour >= 16 && hour < 20) {
      slot = "16:00-20:00";
    } else if (hour >= 20 && hour < 24) {
      slot = "20:00-24:00";
    }

    let obj = {};
    if (
      !user.lastHotspotUpdated ||
      user.lastHotspotUpdated?.slot != slot ||
      user.lastHotspotUpdated?.date != formattedDate
    ) {
      obj[`${slot}_wa`] = increment(1);
    }
    await updateDoc(doc(db, "ActivityData", formattedDate), obj);
    await addQueueUser(chat_id, {
      lastHotspotUpdated: {
        date: formattedDate,
        slot: slot,
      },
    });
  } catch (err) {
    catchError(err);
    console.log(err);
  }
};

function getDifferenceInMinutes(timestamp1, timestamp2) {
  const time1 = timestamp1.toMillis();
  const time2 = timestamp2.toMillis();

  const differenceMillis = Math.abs(time1 - time2);

  return Math.floor(differenceMillis / 1000 / 60);
}

module.exports = { handleSession };

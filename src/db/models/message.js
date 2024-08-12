const { db } = require("../firebase.js");
const {
  updateDoc,
  doc,
  arrayUnion,
  getDoc,
  deleteField,
  increment,
  addDoc,
  collection,
  serverTimestamp,
} = require("firebase/firestore");
const { addQueueUser } = require("./user.js");
const { catchError } = require("../../bot/errorHandler.js");

const addToContext = async (chat_id, context, cost) => {
  try {
    await addQueueUser(chat_id, {
      context: arrayUnion(...context),
    });
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error adding message to context");
  }
};

const setContext = async (chat_id, context, cost) => {
  try {
    await addQueueUser(chat_id, {
      context: context,
      currentContextCost: cost,
    });
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error resetting context");
    return "ERROR";
  }
};

const resetContext = async (chat_id) => {
  try {
    await addQueueUser(chat_id, {
      context: deleteField(),
      currentContextCost: 0,
    });
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error resetting context");
  }
};

const getContext = async (chat_id) => {
  try {
    const docRef = await getDoc(doc(db, "usersWA", `${chat_id}`));
    console.log("read");
    return docRef.data().context;
  } catch (err) {
    catchError(err);
    console.log(err);
    console.log("Error getting context");
  }
};

module.exports = {
  getContext,
  resetContext,
  setContext,
  addToContext,
};

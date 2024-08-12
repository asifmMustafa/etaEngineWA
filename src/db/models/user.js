const { catchError } = require("../../bot/errorHandler.js");
const { db } = require("../firebase.js");
const {
  updateDoc,
  doc,
  arrayUnion,
  getDoc,
  deleteField,
  setDoc,
  serverTimestamp,
} = require("firebase/firestore");

let queueUserStore = {};

const addNewUser = async (chat_id) => {
  try {
    const docRef = await setDoc(doc(db, "usersWA", `${chat_id}`), {
      joinedOn: serverTimestamp(),
      step: 1,
      mode: `registration`,
    });
    console.log("written user");
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error adding new user");
  }
};

const updateUser = async (chat_id, data) => {
  try {
    const docRef = await updateDoc(doc(db, "usersWA", `${chat_id}`), data);
    console.log("written user");
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error updating user");
  }
};

const addQueueUser = async (chat_id, data) => {
  try {
    let oldData;
    let newData;
    if (queueUserStore && queueUserStore[chat_id]) {
      oldData = queueUserStore[chat_id];
    }
    newData = { ...oldData, ...data };
    queueUserStore[chat_id] = newData;
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error adding User Data to Queue");
  }
};

const updateQueueUser = async (chat_id) => {
  try {
    if (queueUserStore[chat_id]) {
      await updateUser(chat_id, queueUserStore[chat_id]);
      queueUserStore[chat_id] = {};
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error Updating Queue");
  }
};

const getUserData = async (chat_id) => {
  try {
    const docRef = await getDoc(doc(db, "usersWA", `${chat_id}`));
    console.log("read user");
    if (docRef.exists()) {
      return docRef.data();
    } else {
      return "NOT FOUND";
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error getting user data");
  }
};

module.exports = {
  getUserData,
  addNewUser,
  updateUser,
  addQueueUser,
  updateQueueUser,
};

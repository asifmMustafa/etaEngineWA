require("dotenv").config();
const moment = require("moment-timezone");
const { updateShortcutCount } = require("../../db/models/globalData");
const {
  addToContext,
  resetContext,
  setContext,
} = require("../../db/models/message");
const { addQueueUser } = require("../../db/models/user");
const {
  generateResponse,
  generateVisionResponse,
} = require("../../openai/chatgpt");
const {
  sendMessage,
  getImage,
  sendFile,
  sendMenuMessage,
} = require("../botUtilities");
const { PDFDocument } = require("pdf-lib");
const officegen = require("officegen");
const rgb = require("node-rtf/lib/rgb");
const { PassThrough } = require("stream");
const { storeDocument } = require("../../db/models/image");
const fs = require("fs");
const fontkit = require("@pdf-lib/fontkit");

const { catchError } = require("../errorHandler");
const {
  timeout,
  contextHasExceeded,
  translateText,
} = require("../../utilities");
const { increment } = require("firebase/firestore");
const { getMessages } = require("../../db/models/snapshotListeners");
const { generateGeminiVisionResponse } = require("../../gemini/gemini-vision");

const fontBytes = fs.readFileSync("src/font/DejaVuSans.ttf"); // custom font for creating pdfs

let BOT_REPLIES = {};
let PROMPTS = {};

const assignmentHelp = async (chat_id, phone_id, user, text) => {
  try {
    const messages = getMessages();
    BOT_REPLIES = messages.bot_replies;
    PROMPTS = messages.prompts;
    let language = user.language || "english";

    if (!user.premium && user.assignmentHelp > 2 && user.mode == "menu") {
      await addQueueUser(chat_id, { step: 0, mode: "menu" });
      await sendMessage(
        chat_id,
        phone_id,
        "Purchase premium to use this shortcut again."
      );
      await sendMenuMessage(chat_id, phone_id, language);
      return;
    }

    const current_month = `${moment().tz("Asia/Dhaka").month() + 1}/${moment()
      .tz("Asia/Dhaka")
      .year()}`;

    let use_gemini = false;

    if (user.premium && "assignment_help_monthly_count" in user) {
      if (
        user.assignment_help_monthly_count.month == current_month &&
        user.assignment_help_monthly_count.count > 3
      ) {
        use_gemini = true;
      }
    }

    switch (user.step) {
      case 0:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.assignment_help_picture_upload[language]
        );
        await addQueueUser(chat_id, {
          mode: "assignmentHelp",
          step: 1,
        });

        await updateShortcutCount(chat_id, `assignmentHelp`, user.userType);

        if (user.premium) {
          if ("assignment_help_monthly_count" in user) {
            if (user.assignment_help_monthly_count.month !== current_month) {
              await addQueueUser(chat_id, {
                assignment_help_monthly_count: {
                  month: current_month,
                  count: 1,
                },
              });
            } else {
              await addQueueUser(chat_id, {
                assignment_help_monthly_count: {
                  month: current_month,
                  count: user.assignment_help_monthly_count.count + 1,
                },
              });
            }
          } else {
            await addQueueUser(chat_id, {
              assignment_help_monthly_count: {
                month: current_month,
                count: 1,
              },
            });
          }
        }

        return;
      case 1:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.assignment_help_picture_upload[language]
        );

        return;
      case 2:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.assignment_help_read_assignment[language]
        );
        const photo = user.followUpStore;
        console.log(photo);

        let context = [];
        if (user.context) {
          context = user.context;
        }

        // context.push({
        //   role: "system",
        //   content: `You are a helpful AI-teacher who solves questions/problem for students and keep the solutions short. If you see any maths related problem, reply with “I’m still learning maths” and then respond.`,
        // });
        const vision_prompt = use_gemini
          ? PROMPTS.assignment_help_prefix_GEMINI
          : PROMPTS.assignment_help_prefix.replace("{INSTRUCTIONS}", text);

        context.push({
          role: "user",
          content: vision_prompt,
        });

        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.assignment_help_solve_problem[language]
        );

        const response = use_gemini
          ? await generateGeminiVisionResponse(vision_prompt, photo)
          : await generateVisionResponse(
              vision_prompt,
              photo,
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

        await sendMessage(chat_id, phone_id, response.text);
        if (use_gemini)
          await sendMessage(chat_id, phone_id, "Gemini was used.");
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.assignment_help_further_query_or_download_wa[language]
        );
        context.push({ role: "assistant", content: response.text });
        await addToContext(chat_id, context);
        await addQueueUser(chat_id, {
          step: 3,
          followUpStore: `${chat_id}_assignment`,
          currentContextCost: increment(response.cost),
        });
        return;
      case 3:
        if (text.toLowerCase() == "yes") {
          console.log(user.followUpStore);
          const pdf2 = await createPdf(
            user?.context[user?.context?.length - 1]?.content,
            user.followUpStore
          );

          const pdfResponseBuffer2 = Buffer.from(pdf2);
          let docLink1 = await storeDocument(
            chat_id,
            pdfResponseBuffer2,
            `${user.followUpStore}pdf`,
            `pdf`
          );
          await sendFile(chat_id, phone_id, docLink1, user.followUpStore);

          const doc2 = await createDoc(
            user?.context[user?.context?.length - 1]?.content,
            user.followUpStore
          );
          const docResponseBuffer2 = Buffer.from(doc2);
          let docLink2 = await storeDocument(
            chat_id,
            docResponseBuffer2,
            `${user.followUpStore}doc`,
            `docx`
          );

          await sendFile(chat_id, phone_id, docLink2, user.followUpStore);

          await sendMessage(
            chat_id,
            phone_id,
            BOT_REPLIES.assignment_help_followup_queries[language]
          );

          return;
        } else {
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

          if (language == "bangla") {
            const translated_text = await translateText(response.text, "bn");
            await sendMessage(chat_id, phone_id, translated_text);
          } else {
            await sendMessage(chat_id, phone_id, response.text);
          }

          await addQueueUser(chat_id, {
            currentContextCost: increment(response.cost),
          });

          if (contextHasExceeded(user, response)) {
            await sendMessage(
              chat_id,
              phone_id,
              BOT_REPLIES.context_reset[language]
            );
            let res = await setContext(
              chat_id,
              [{ role: "assistant", content: response.text }],
              response.cost
            );

            if (res === "ERROR") {
              await resetContext(chat_id);
              await addQueueUser(chat_id, { mode: "menu", step: 0 });
              await sendMenuMessage(chat_id, phone_id, language);
              return;
            }
          } else {
            context.push({ role: "assistant", content: response.text });
            await addToContext(chat_id, context);
          }

          await sendMessage(
            chat_id,
            phone_id,
            BOT_REPLIES.assignment_help_further_query_or_download_wa[language]
          );
        }
    }
  } catch (err) {
    resetContext(chat_id);
    catchError(err);
    console.log(err.message);
    console.log("Error in assignmentHelp mode");

    await sendMessage(
      chat_id,
      phone_id,
      BOT_REPLIES.shortcut_failed[language].replace(
        "{MODE}",
        "Solve my Assignment"
      )
    );
    await sendMenuMessage(chat_id, phone_id, language);
    addQueueUser(chat_id, { mode: "menu", step: 0 });
  }
};

const assignmentHelpImage = async (
  chat_id,
  phone_id,
  user,
  text,
  messageData
) => {
  try {
    let language = user.language || "english";

    switch (user.step) {
      case 1:
        const image = await getImage(messageData.image.id, chat_id);
        await addQueueUser(chat_id, { followUpStore: image, step: 2 });
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.assignment_help_additional_instructions[language]
        );
        return;
      default:
        await sendMessage(
          chat_id,
          phone_id,
          BOT_REPLIES.only_text_allowed[language]
        );
    }
  } catch (err) {
    catchError(err);
    console.log(err.message);
    console.log("Error in assignmentHelp mode");

    await sendMessage(
      chat_id,
      phone_id,
      BOT_REPLIES.shortcut_failed[language].replace(
        "{MODE}",
        "Solve my Assignment"
      )
    );
    await sendMenuMessage(chat_id, phone_id, language);
    addQueueUser(chat_id, { mode: "menu", step: 0 });
  }
};

const createPdf = async (data, name) => {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create({ options: { name: name } });
  pdfDoc.registerFontkit(fontkit);
  const customFont = await pdfDoc.embedFont(fontBytes);

  // Set up fonts and styles
  const fontSize = 13;
  const textColor = rgb(0, 0, 0);
  const pageWidth = 600;
  const pageHeight = 800;
  const margin = 50;
  const maxLineWidth = pageWidth - 2 * margin; // Maximum width for text line
  const avgCharWidth = fontSize * 0.5; // Approximate average character width based on the font size

  let yPosition = pageHeight - 4 * fontSize;

  // Add a blank page to the document
  let page = pdfDoc.addPage([pageWidth, pageHeight]);

  const textLines = data.split("\n");
  console.log(textLines);

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i];

    let words = line.split(" ");
    let lineBuffer = "";

    for (let word of words) {
      let testLine = `${lineBuffer}${word} `;
      let testLineWidth = avgCharWidth * testLine.length; // Approximate text width (not exact but better)

      if (testLineWidth > maxLineWidth) {
        // Draw the line and prepare for a new one
        if (yPosition < margin) {
          // Add new page and reset yPosition
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          yPosition = pageHeight - 4 * fontSize;
        }
        page.drawText(lineBuffer, {
          x: margin,
          y: yPosition,
          size: fontSize,
          color: textColor,
          font: customFont,
        });

        // Update the y-position for the next line
        yPosition -= fontSize + 5; // 5 is line spacing

        lineBuffer = `${word} `;
      } else {
        lineBuffer = testLine;
      }
    }

    // Draw any remaining text in buffer
    if (yPosition < margin) {
      // Add new page and reset yPosition
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - 4 * fontSize;
    }
    page.drawText(lineBuffer, {
      x: margin,
      y: yPosition,
      size: fontSize,
      color: textColor,
      font: customFont,
    });

    // Update the y-position for the next line
    yPosition -= fontSize + 5; // 5 is line spacing
  }

  // Serialize the PDF to bytes (a Uint8Array)
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
};

const createDoc = (data, name) => {
  return new Promise((resolve, reject) => {
    const docx = officegen("docx");

    // Add some text to the document.
    const title = docx.createP();
    title.options.align = "center";
    title.addText(`${name}\n\n`, {
      bold: true,
      font_face: "Arial",
      font_size: 24,
    });

    const paragraph = docx.createP();
    paragraph.addText(data);

    // Create a PassThrough stream to collect the buffer.
    const pass = new PassThrough();
    const chunks = [];

    pass.on("data", function (chunk) {
      chunks.push(chunk);
    });

    pass.on("end", function () {
      const buffer = Buffer.concat(chunks);
      console.log("Buffer size:", buffer.length);
      resolve(buffer); // Resolve the Promise with the buffer.
    });

    pass.on("error", function (err) {
      reject(err); // Reject the Promise if an error occurs.
    });

    // Pipe the officegen stream to the PassThrough stream.
    docx.generate(pass);
  });
};

module.exports = {
  assignmentHelp,
  assignmentHelpImage,
};

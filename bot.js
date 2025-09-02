require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const admin = require("firebase-admin");
const { MongoClient } = require("mongodb");

// ========================
// 1️⃣ ENV / Config
// ========================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

const MONGODB_URI = process.env.MONGODB_URI;
const FIREBASE_SA_BASE64 = process.env.FIREBASE_SA_BASE64;
const UPI_ID = process.env.UPI_ID;
const QR_IMAGE_URL = process.env.QR_IMAGE_URL;

const KEY_PRICE = {
  "7day": Number(process.env.KEY_PRICE_7DAY || 100),
  "15day": Number(process.env.KEY_PRICE_15DAY || 180),
  "30day": Number(process.env.KEY_PRICE_30DAY || 300),
};
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS || 10);
const MIN_WITHDRAW = Number(process.env.MIN_WITHDRAW || 50);
const OFFER = {
  count: Number(process.env.OFFER_KEY_COUNT || 10),
  free: Number(process.env.OFFER_FREE_KEY || 2),
};
const LANGUAGES = process.env.LANGUAGES ? process.env.LANGUAGES.split(",") : ["EN"];

// ========================
// 2️⃣ Initialize Firebase
// ========================
const saJson = JSON.parse(Buffer.from(FIREBASE_SA_BASE64, "base64").toString("utf-8"));
admin.initializeApp({ credential: admin.credential.cert(saJson) });
const fbDb = admin.database();

// ========================
// 3️⃣ Initialize MongoDB
// ========================
const mongoClient = new MongoClient(MONGODB_URI);
let mongoDb;
async function getDb() {
  if (!mongoDb) {
    await mongoClient.connect();
    mongoDb = mongoClient.db();
  }
  return mongoDb;
}

// ========================
// 4️⃣ Bot Init
// ========================
const bot = new Telegraf(BOT_TOKEN);
bot.context.session = {}; // for storing session data

// ========================
// 5️⃣ /start Command
// ========================
bot.start(async (ctx) => {
  await ctx.reply(
    `👋 Welcome ${ctx.from.first_name}!\n\nThis is 𝐌𝐫 𝐑𝐚𝐛𝐛𝐢𝐭 𝐊𝐞𝐲 Bot.`,
    Markup.keyboard([
      ["🔑 Buy Key", "📦 My Keys"],
      ["💰 Wallet", "👥 Referral"],
      ["⚙️ Settings"]
    ]).resize()
  );
});

// ========================
// 6️⃣ Settings Button
// ========================
bot.hears("⚙️ Settings", async (ctx) => {
  await ctx.reply(
    `⚙️ Current System Settings:\n\n` +
    `💵 Key Price:\n  • 7 Day = ₹${KEY_PRICE["7day"]}\n  • 15 Day = ₹${KEY_PRICE["15day"]}\n  • 30 Day = ₹${KEY_PRICE["30day"]}\n\n` +
    `🎁 Offer: Buy ${OFFER.count} Keys → Get ${OFFER.free} Free\n` +
    `👥 Referral Bonus = ₹${REFERRAL_BONUS}\n` +
    `💳 Minimum Withdraw = ₹${MIN_WITHDRAW}\n` +
    `🌐 Languages: ${LANGUAGES.join(", ")}`
  );
});

// ========================
// 7️⃣ Buy Key Flow
// ========================
bot.hears("🔑 Buy Key", async (ctx) => {
  await ctx.reply(
    "📅 Choose Key Duration:",
    Markup.inlineKeyboard([
      [{ text: `7 Days (₹${KEY_PRICE["7day"]})`, callback_data: "buy:7day" }],
      [{ text: `15 Days (₹${KEY_PRICE["15day"]})`, callback_data: "buy:15day" }],
      [{ text: `30 Days (₹${KEY_PRICE["30day"]})`, callback_data: "buy:30day" }],
    ])
  );
});

bot.action(/buy:(.+)/, async (ctx) => {
  const duration = ctx.match[1];
  ctx.session = ctx.session || {};
  ctx.session.buy = { duration };

  await ctx.reply(
    "📱 Select Number of Devices:",
    Markup.inlineKeyboard([
      [{ text: "1 Device", callback_data: "device:1" }],
      [{ text: "2 Devices", callback_data: "device:2" }],
      [{ text: "3 Devices", callback_data: "device:3" }],
    ])
  );
});

bot.action(/device:(\d+)/, async (ctx) => {
  const devices = Number(ctx.match[1]);
  ctx.session.buy.devices = devices;

  const duration = ctx.session.buy.duration;
  const price = KEY_PRICE[duration] * devices;

  await ctx.replyWithPhoto(
    { url: QR_IMAGE_URL },
    {
      caption:
        `🧾 *Order Summary*\n\n` +
        `🕒 Duration: *${duration}*\n📱 Devices: *${devices}*\n💵 Price: *₹${price}*\n\n` +
        `📌 Pay to UPI: \`${UPI_ID}\`\n\n` +
        `✅ After payment, send Transaction ID using /tx <your_id>`,
      parse_mode: "Markdown",
    }
  );
});

// ========================
// 8️⃣ Transaction ID
// ========================
bot.command("tx", async (ctx) => {
  const txId = ctx.message.text.split(" ")[1];
  if (!txId) return ctx.reply("⚠️ Please provide transaction id. Example: `/tx 1234567890`", { parse_mode: "Markdown" });

  const order = ctx.session?.buy;
  if (!order) return ctx.reply("❌ No active order. Please start again with 🔑 Buy Key.");

  // Notify admin
  await ctx.telegram.sendMessage(
    ADMIN_ID,
    `📢 *New Payment Received*\n\n👤 User: ${ctx.from.first_name} (${ctx.from.id})\n🕒 Duration: ${order.duration}\n📱 Devices: ${order.devices}\n💳 TxID: ${txId}`,
    { parse_mode: "Markdown" }
  );

  await ctx.reply("✅ Transaction ID submitted. Admin will verify and provide your key within 6 hours.");
});

// ========================
// 9️⃣ My Keys (User Key History)
// ========================
bot.hears("📦 My Keys", async (ctx) => {
  const db = await getDb();
  const users = db.collection("users");
  const user = await users.findOne({ telegram_id: ctx.from.id });
  const keys = user?.key_history || [];
  if (!keys.length) return ctx.reply("📭 You have no keys yet.");

  let msg = "📦 Your Keys:\n\n";
  keys.forEach((k,i)=> msg += `${i+1}. ${k.key} | Active: ${k.active ? "✅" : "❌"} | ${k.date.toLocaleString()}\n`);
  await ctx.reply(msg);
});

// ========================
// 🔹 Wallet
// ========================
bot.hears("💰 Wallet", async (ctx) => {
  const db = await getDb();
  const users = db.collection("users");
  const user = await users.findOne({ telegram_id: ctx.from.id });
  const balance = user?.wallet || 0;
  await ctx.reply(`💰 Your Wallet Balance: ₹${balance}\n\nAdd fund or withdraw via admin commands.`);
});

// ========================
// 👥 Referral
// ========================
bot.hears("👥 Referral", async (ctx) => {
  const refLink = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
  await ctx.reply(`👥 Your referral link:\n${refLink}\n💵 Bonus per referral: ₹${REFERRAL_BONUS}`);
});

// ========================
// 10️⃣ Admin Commands
// ========================

// Approve Key
bot.command("approve", async (ctx) => {
  if (String(ctx.from.id)!==String(ADMIN_ID)) return ctx.reply("❌ Unauthorized");
  const args = ctx.message.text.split(" ");
  if(args.length<3) return ctx.reply("Usage: /approve <user_id> <key>");
  const userId=args[1], keyValue=args[2];
  try{
    // Firebase save
    const dbRef = fbDb.ref(`keys/${userId}`);
    await dbRef.push({key:keyValue,created_at:new Date().toISOString(),active:true});
    // Mongo save
    const db = await getDb();
    const users = db.collection("users");
    await users.updateOne({telegram_id:userId},{$push:{key_history:{key:keyValue,date:new Date(),active:true}}},{upsert:true});
    // Notify user
    await ctx.telegram.sendMessage(userId,`✅ Your key has been approved!\n🔑 Key: ${keyValue}`);
    await ctx.reply(`✅ Key approved and sent to user ${userId}`);
  }catch(e){console.error(e);ctx.reply("❌ Error approving key");}
});

// Broadcast
bot.command("broadcast", async(ctx)=>{
  if(String(ctx.from.id)!==String(ADMIN_ID)) return ctx.reply("❌ Unauthorized");
  const text = ctx.message.text.split(" ").slice(1).join(" ");
  if(!text) return ctx.reply("Usage: /broadcast <message>");
  const db = await getDb();
  const users = db.collection("users");
  const allUsers = await users.find({}).toArray();
  allUsers.forEach(u=> ctx.telegram.sendMessage(u.telegram_id,text).catch(()=>{}));
  ctx.reply(`✅ Broadcast sent to ${allUsers.length} users.`);
});

// ========================
// 11️⃣ Error Handling
// ========================
bot.catch((err, ctx) => {
  console.error("Bot Error:", err);
  if(ctx) ctx.reply("⚠️ Something went wrong.");
});

// ========================
// 12️⃣ Launch Bot
// ========================
bot.launch().then(()=>console.log("✅ Bot running")).catch(err=>console.error(err));
process.once("SIGINT",()=>bot.stop("SIGINT"));
process.once("SIGTERM",()=>bot.stop("SIGTERM"));

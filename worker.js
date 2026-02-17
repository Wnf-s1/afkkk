// worker.js
const { Client } = require("discord.js-selfbot-v13");
const { joinVoiceChannel, getVoiceConnection } = require("@discordjs/voice");

process.removeAllListeners("warning");

const token = process.argv[2] || null;
let client = null;
let lastReady = null;
let currentVoice = { serverId: null, channelId: null };

// إرسال الأحداث
function sendEvent(event, info) {
  if (process.send) process.send({ type: "event", event, info });
}

// إرسال الردود
function sendReply(requestId, payload) {
  if (process.send) process.send({ type: "reply", requestId, payload });
}

// إرسال لوج ملون
function sendLog(message, color = "white") {
  if (process.send) process.send({ type: "log", info: message, color });
}

async function safeLogin(tok) {
  if (!tok) {
    sendLog("❌ No token provided, worker idle.", "red");
    return;
  }
  client = new Client({ checkUpdate: false, intents: [] });

  client.on("ready", () => {
    lastReady = Date.now();
    sendLog(`✅ Logged in as: ${client.user.username}`, "green");
  });

  client.on("error", (e) => {
    sendLog(`⚠️ Error: ${String(e)}`, "red");
  });

  try {
    await client.login(tok);
  } catch (err) {
    sendLog(`❌ Login failed: ${err.message}`, "red");
  }
}

process.on("message", async (msg) => {
  if (!msg || msg.type !== "cmd") return;
  const { cmd, payload, requestId } = msg;

  try {
    if (cmd === "status") {
      const ready = !!(client && client.user);
      let username = null, displayName = null, inVoice = false, serverId = null, channelId = null;
      if (ready) {
        username = client.user.username;
        displayName = client.user.globalName || client.user.username;
        for (const g of client.guilds.cache.values()) {
          const vs = g.voiceStates.cache.get(client.user.id);
          if (vs && vs.channelId) {
            inVoice = true;
            serverId = g.id;
            channelId = vs.channelId;
            break;
          }
        }
      }
      sendReply(requestId, { ready, username, displayName, inVoice, serverId, channelId });
    } 
    else if (cmd === "join") {
      const { serverId, channelId } = payload;
      if (!client || !client.user) {
        await safeLogin(token);
      }
      const guild = client.guilds.cache.get(serverId);
      const channel = guild?.channels.cache.get(channelId);
      if (!guild || !channel || !channel.joinable) {
        sendLog(`❌ Invalid guild or channel`, "red");
        sendReply(requestId, { success: false, error: "Invalid guild/channel" });
        return;
      }
      try {
        joinVoiceChannel({
          channelId: channel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false
        });
        currentVoice = { serverId, channelId };
        sendLog(`🔊 Joined voice: ${guild.name} / ${channel.name}`, "cyan");
        sendReply(requestId, { success: true });
      } catch (err) {
        sendLog(`❌ Failed to join: ${err.message}`, "red");
        sendReply(requestId, { success: false, error: err.message });
      }
    } 
    else if (cmd === "disconnect") {
      const serverId = payload?.serverId || currentVoice.serverId;
      if (!serverId) {
        sendLog(`⚠️ Not connected to any voice channel`, "yellow");
        sendReply(requestId, { success: false, error: "Not connected" });
        return;
      }
      const conn = getVoiceConnection(serverId);
      if (conn) {
        conn.destroy();
        currentVoice = { serverId: null, channelId: null };
        sendLog(`👋 Disconnected from voice channel`, "cyan");
        sendReply(requestId, { success: true });
      } else {
        sendLog(`❌ No connection found`, "red");
        sendReply(requestId, { success: false, error: "No connection found" });
      }
    } 
    else if (cmd === "sendMessage") {
      const { channelId, message } = payload;
      try {
        const channel = await client.channels.fetch(channelId);
        await channel.send(message);
	 await channel.send(message + "1");
	 await channel.send(message + "2");
        sendLog(`💬 Message sent to channel ${channelId}`, "green");
        sendReply(requestId, { success: true });
      } catch (err) {
        sendLog(`❌ Failed to send message: ${err.message}`, "red");
        sendReply(requestId, { success: false, error: err.message });
      }
    }
    else if (cmd === "sendDM") {
      const { userId, message } = payload;
      try {
        const user = await client.users.fetch(userId);
        await user.send(message);
        sendLog(`📨 DM sent to user ${userId}`, "green");
        sendReply(requestId, { success: true });
      } catch (err) {
        sendLog(`❌ Failed to send DM: ${err.message}`, "red");
        sendReply(requestId, { success: false, error: err.message });
      }
    }
    else {
      sendLog(`⚠️ Unknown command: ${cmd}`, "yellow");
      sendReply(requestId, { success: false, error: "Unknown command" });
    }
  } catch (err) {
    sendLog(`❌ Error: ${String(err)}`, "red");
    sendReply(requestId, { success: false, error: String(err) });
  }
});

safeLogin(token).catch(() => {});

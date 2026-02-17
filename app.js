const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const figlet = require("figlet");
const gradient = require("gradient-string");
const inquirer = require("inquirer").default;
const center = require("center-align");
const { fork } = require("child_process");

const tokensFile = path.join(process.cwd(), "tokens.txt");
let workers = {}; // { token: process }

function loadTokens() {
  if (!fs.existsSync(tokensFile)) return [];
  return fs.readFileSync(tokensFile, "utf8").split("\n").filter(t => t.trim() !== "");
}

function saveTokens(tokens) {
  fs.writeFileSync(tokensFile, tokens.join("\n"), "utf8");
}

function startWorker(token) {
  if (workers[token]) return;
  const worker = fork(path.join(__dirname, "worker.js"), [token]);
  workers[token] = worker;

  worker.on("message", (msg) => {
    if (msg.type === "event") {
      console.log(chalk.cyan(`[${token.slice(0, 6)}...] ${msg.event}: ${msg.info || ""}`));
    }
  });

  worker.on("exit", () => {
    console.log(chalk.red(`[${token.slice(0, 6)}...] Worker stopped`));
    delete workers[token];
  });
}

async function sendMessageToUser() {
  const { userId, message } = await inquirer.prompt([
    { type: "input", name: "userId", message: "Enter User ID:" },
    { type: "input", name: "message", message: "Enter Message:" }
  ]);

  const tokens = loadTokens();

  await Promise.all(tokens.map(t => {
    return new Promise(resolve => {
      workers[t]?.send({
        type: "cmd",
        cmd: "sendDM",
        payload: { userId, message },
        requestId: Date.now()
      });
      resolve();
    });
  }));

  return mainMenu(chalk.green(`📨 Message sent to user ${userId} from all tokens.`));
}

function showTitle() {
  console.clear();
  const title = figlet.textSync("60hp Tools", { horizontalLayout: "default" });
  console.log(gradient.pastel.multiline(center(title, 80)));
  console.log(chalk.gray(center("────────────────────────────────────────────", 80)));
  console.log(gradient.cristal(center("https://discord.gg/hcDM34VS", 80)));
  console.log("\n");
}

async function mainMenu(lastOutput = "") {
  showTitle();
  if (lastOutput) {
    console.log(chalk.white(center(lastOutput, 80)));
    console.log("\n");
  }

  const tokens = loadTokens();

  const choices = [
    "➕ Add Token",
    "📜 List Tokens",
    "🔍 Search Token",
    "👀 View All Tokens",
  ];

  if (tokens.length) {
    choices.push("🎤 Join All Tokens");
    choices.push("📩 Join All Tokens by Invite Link");
    choices.push("💬 Send Message to Channel");
    choices.push("📨 Send Message to a User");
    choices.push("📴 Leave All Tokens");
    choices.push("❌ Remove Token");
  }

  choices.push("🚪 Exit");

  const { menu } = await inquirer.prompt([
    {
      type: "list",
      name: "menu",
      message: chalk.bold("Choose an action:"),
      choices
    }
  ]);

  switch (menu) {
    case "➕ Add Token": return addToken();
    case "📜 List Tokens": return listTokens();
    case "🔍 Search Token": return searchToken();
    case "👀 View All Tokens": return viewAllTokens();
    case "🎤 Join All Tokens": return joinAllTokens();
    case "📩 Join All Tokens by Invite Link": return joinAllTokensByInvite();
    case "💬 Send Message to Channel": return sendMessageToChannel();
    case "📨 Send Message to a User": return sendMessageToUser();
    case "📴 Leave All Tokens": return leaveAllTokens();
    case "❌ Remove Token": return removeToken();
    case "🚪 Exit": return exitApp();
  }
}

async function addToken() {
  const { token } = await inquirer.prompt([{ type: "input", name: "token", message: "Enter token:" }]);
  const tokens = loadTokens();
  if (!tokens.includes(token)) {
    tokens.push(token);
    saveTokens(tokens);
    startWorker(token);
    return mainMenu(chalk.green("✅ Token added and worker started."));
  }
  return mainMenu(chalk.yellow("⚠️ Token already exists."));
}

async function listTokens() {
  const tokens = loadTokens();
  if (!tokens.length) return mainMenu(chalk.red("No tokens found."));

  let output = chalk.bold("Stored Tokens:\n\n");
  tokens.forEach((t, i) => {
    output += `${chalk.gray(i + 1 + ".")} ${chalk.yellow(t.slice(0, 25))}...\n`;
  });

  await pause();
  return mainMenu(output);
}

async function searchToken() {
  const { search } = await inquirer.prompt([{ type: "input", name: "search", message: "Enter token to search:" }]);
  const tokens = loadTokens();
  if (tokens.includes(search)) {
    await tokenControl(search);
  } else {
    return mainMenu(chalk.red("❌ Token not found."));
  }
}

async function tokenControl(token) {
  const { action } = await inquirer.prompt([{
    type: "list",
    name: "action",
    message: "Control this token:",
    choices: [
      "🎤 Join Voice Channel",
      "📴 Disconnect from Voice",
      "⬅ Back"
    ]
  }]);

  if (action === "🎤 Join Voice Channel") {
    const { serverId, channelId } = await inquirer.prompt([
      { type: "input", name: "serverId", message: "Enter Server ID:" },
      { type: "input", name: "channelId", message: "Enter Channel ID:" }
    ]);
    workers[token]?.send({ type: "cmd", cmd: "join", payload: { serverId, channelId }, requestId: Date.now() });
    return mainMenu(chalk.green(`🎤 Token joined channel ${channelId} in server ${serverId}.`));
  }

  if (action === "📴 Disconnect from Voice") {
    workers[token]?.send({ type: "cmd", cmd: "disconnect", payload: {}, requestId: Date.now() });
    return mainMenu(chalk.green("📴 Token disconnected from voice channel."));
  }

  return mainMenu();
}

async function removeToken() {
  const tokens = loadTokens();
  if (!tokens.length) return mainMenu(chalk.red("No tokens to remove."));

  const { token } = await inquirer.prompt([
    {
      type: "list",
      name: "token",
      message: "Select token to remove:",
      choices: tokens.map(t => ({ name: t.slice(0, 25) + "...", value: t }))
    }
  ]);
  const newTokens = tokens.filter(t => t !== token);
  saveTokens(newTokens);
  if (workers[token]) {
    workers[token].kill();
    delete workers[token];
  }
  return mainMenu(chalk.green("✅ Token removed."));
}

async function viewAllTokens() {
  const tokens = loadTokens();
  if (!tokens.length) return mainMenu(chalk.red("No tokens found."));

  const statuses = await Promise.all(tokens.map(t => getWorkerStatus(t)));

  let output = chalk.bold("Tokens Status:\n\n");
  statuses.forEach(({ token, ready, username, displayName, inVoice, serverId, channelId }) => {
    output += `${chalk.gray("-")} ${chalk.yellow(token.slice(0, 15))}... | `;
    output += ready ? chalk.green("Online") : chalk.red("Offline");
    output += " | ";
    output += inVoice ? chalk.blue(`In Voice [${channelId}@${serverId}]`) : chalk.gray("Not in Voice");
    output += ` | User: ${chalk.cyan(displayName || username || "N/A")}\n`;
  });

  await pause();
  return mainMenu(output);
}

async function joinAllTokens() {
  const { serverId, channelId } = await inquirer.prompt([
    { type: "input", name: "serverId", message: "Enter Server ID:" },
    { type: "input", name: "channelId", message: "Enter Channel ID:" }
  ]);
  const tokens = loadTokens();
  tokens.forEach(t => {
    workers[t]?.send({ type: "cmd", cmd: "join", payload: { serverId, channelId }, requestId: Date.now() });
  });
  return mainMenu(chalk.green(`🎤 All tokens joined channel ${channelId} in server ${serverId}.`));
}


const puppeteer = require("puppeteer");

async function manualSolve(inviteCode, token) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // افتح صفحة الدعوة في Discord
  await page.goto(`https://discord.com/invite/${inviteCode}`, {
    waitUntil: "networkidle2",
  });

  console.log(
    chalk.yellow(
      `[${token.slice(0, 6)}...] ⚠️ افتح التبويب اللي ظهر وحل الكابتشا يدويًا، بعد ما تخلص ارجع هنا.`
    )
  );

  // استنى المستخدم يضغط Enter في الكونسول بعد ما يحل الكابتشا
  await inquirer.prompt([
    {
      type: "input",
      name: "done",
      message: "🔑 اضغط Enter هنا بعد ما تحل الكابتشا...",
    },
  ]);

  await browser.close();
}

async function joinAllTokensByInvite() {
  const { invite } = await inquirer.prompt([
    { type: "input", name: "invite", message: "Enter Discord Invite Link:" },
  ]);

  const inviteCode = invite.split("/").pop();
  const tokens = loadTokens();

  for (const token of tokens) {
    try {
      let res = await fetch(
        `https://discord.com/api/v9/invites/${inviteCode}`,
        {
          method: "POST",
          headers: {
            Authorization: token,
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
        }
      );

      if (res.status === 200) {
        console.log(
          chalk.green(`[${token.slice(0, 6)}...] ✅ Joined server`)
        );
        continue;
      }

      const data = await res.json();
      if (data.captcha_sitekey) {
        console.log(
          chalk.yellow(
            `[${token.slice(0, 6)}...] 🛑 Captcha detected → Manual solve required`
          )
        );

        await manualSolve(inviteCode, token);

        // بعد ما تحل الكابتشا يدويًا، جرب تاني
        res = await fetch(
          `https://discord.com/api/v9/invites/${inviteCode}`,
          {
            method: "POST",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
          }
        );

        if (res.status === 200) {
          console.log(
            chalk.green(
              `[${token.slice(0, 6)}...] ✅ Joined after manual captcha solve`
            )
          );
        } else {
          console.log(
            chalk.red(
              `[${token.slice(0, 6)}...] ❌ Failed after manual captcha (${res.status})`
            )
          );
        }
      } else {
        console.log(
          chalk.red(`[${token.slice(0, 6)}...] ❌ Failed (${res.status})`)
        );
      }
    } catch (err) {
      console.log(
        chalk.red(`[${token.slice(0, 6)}...] Error: ${err.message}`)
      );
    }
  }

  return mainMenu(
    chalk.green("📩 Join by Invite attempt completed.")
  );
}


async function sendMessageToChannel() {
  const { channelId, message } = await inquirer.prompt([
    { type: "input", name: "channelId", message: "Enter Channel ID:" },
    { type: "input", name: "message", message: "Enter Message:" }
  ]);

  const tokens = loadTokens();

  await Promise.all(tokens.map(t => {
    return new Promise(resolve => {
      workers[t]?.send({
        type: "cmd",
        cmd: "sendMessage",
        payload: { channelId, message },
        requestId: Date.now()
      });
      resolve();
    });
  }));

  return mainMenu(chalk.green(`💬 Message sent to channel ${channelId} from all tokens.`));
}

async function leaveAllTokens() {
  const tokens = loadTokens();
  tokens.forEach(t => {
    workers[t]?.send({ type: "cmd", cmd: "disconnect", payload: {}, requestId: Date.now() });
  });
  return mainMenu(chalk.green("📴 All tokens disconnected from voice channels."));
}

function exitApp() {
  console.log(chalk.magenta("\nGoodbye!\n"));
  process.exit(0);
}

async function pause() {
  await inquirer.prompt([{ type: "input", name: "pause", message: "Press Enter to continue..." }]);
}

function getWorkerStatus(token) {
  return new Promise(resolve => {
    if (!workers[token]) return resolve({ token, ready: false });

    const reqId = Date.now() + Math.random();
    const onMessage = (msg) => {
      if (msg.type === "reply" && msg.requestId === reqId) {
        workers[token].off("message", onMessage);
        resolve({ token, ...msg.payload });
      }
    };
    workers[token].on("message", onMessage);
    workers[token].send({ type: "cmd", cmd: "status", requestId: reqId });

    setTimeout(() => {
      workers[token].off("message", onMessage);
      resolve({ token, ready: false });
    }, 3000);
  });
}

loadTokens().forEach(startWorker);
mainMenu();

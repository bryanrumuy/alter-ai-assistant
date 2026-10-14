const fs = require("fs");

const memoryFile = "memory.json";

let memory = {};
if (fs.existsSync(memoryFile)) {
    memory = JSON.parse(fs.readFileSync(memoryFile));
}

function saveMemory() {
    fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2));
}

function randomReply(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// mood AI
const moods = ["sibuk", "santai", "capek"];
let currentMood = moods[Math.floor(Math.random() * moods.length)];

function detectSlang(text) {
    const slangMap = {
        "gk": "tidak",
        "ga": "tidak",
        "lg": "lagi",
        "dmn": "dimana",
        "km": "kamu",
        "gw": "aku",
        "lo": "kamu",
        "otw": "otw"
    };

    Object.keys(slangMap).forEach(slang => {
        text = text.replace(slang, slangMap[slang]);
    });

    return text;
}

async function askAI(message, senderName) {
    let text = message.toLowerCase();
    text = detectSlang(text);

    if (!memory[senderName]) {
        memory[senderName] = {
            count: 0,
            lastMessage: ""
        };
    }

    memory[senderName].count++;
    memory[senderName].lastMessage = message;
    saveMemory();

    // RESPON BERDASARKAN MOOD
    if (currentMood === "capek") {
        return "Bryan lagi capek, nanti ya.";
    }

    if (currentMood === "sibuk" && text.includes("halo")) {
        return `Halo ${senderName}, Bryan lagi sibuk.`;
    }

    // HUMOR
    if (text.includes("wkw") || text.includes("haha")) {
        return randomReply([
            "Wkwk 😄",
            "Haha iya.",
            "Lucu juga."
        ]);
    }

    // SAPAAN / MANGGIL
    if (/(halo|hai|we|woy|oi|bro|bry|p)/.test(text)) {
        return randomReply([
            `Halo ${senderName}!`,
            "Ada apa?",
            "Pesan masuk 🙂"
        ]);
    }

    // INGAT PESAN TERAKHIR
    if (text.includes("ingat")) {
        return `Terakhir kamu bilang: "${memory[senderName].lastMessage}"`;
    }

    // ORANG SERING CHAT
    if (memory[senderName].count > 5) {
        return randomReply([
            `Sering chat ya ${senderName} 😄`,
            "Pesan diterima.",
            "Oke."
        ]);
    }

    // DEFAULT PERSONALITY
    return randomReply([
        `Oke ${senderName}, nanti Bryan balas ya.`,
        "Bryan lagi tidak pegang HP.",
        "Noted.",
        "Siap."
    ]);
}

module.exports = askAI;

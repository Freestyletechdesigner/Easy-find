require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const readline = require('readline');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function chat() {
    rl.question('Vibe: ', async (prompt) => {
        if (prompt === 'exit') process.exit();
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
        });
        
        console.log('\nGemini:', response.text(), '\n');
        chat(); // Loop
    });
}

chat();
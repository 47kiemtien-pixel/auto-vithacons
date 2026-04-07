require('dotenv').config();

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log('[ListModels] Models available:');
        if (data.models) {
            data.models.forEach(m => console.log(` - ${m.name}`));
        } else {
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error('[ListModels] Error:', e.message);
    }
}

listModels();

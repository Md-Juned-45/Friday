document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const modeToggle = document.getElementById('mode-toggle');
    const textInputMode = document.getElementById('text-input-mode');
    const voiceInputMode = document.getElementById('voice-input-mode');
    const chatBox = document.getElementById('chat-box');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');
    const voiceStatus = document.getElementById('voice-status');
    const micContainer = document.getElementById('mic-container');

    // State Management
    let chatHistory = [];
    let isVoiceMode = false;
    let isConversationActive = false;

    // --- TTS using our gTTS Backend ---
    const speak = (text) => {
        return new Promise(async (resolve) => {
            micContainer.classList.add('is-speaking');
            voiceStatus.textContent = 'Assistant is speaking...';
            try {
                const response = await fetch('/synthesize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });
                if (!response.ok) throw new Error("Failed to fetch audio.");

                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                audio.play();
                audio.onended = () => {
                    micContainer.classList.remove('is-speaking');
                    resolve();
                };
            } catch (error) {
                console.error("TTS Error:", error);
                voiceStatus.textContent = "Sorry, couldn't play audio.";
                micContainer.classList.remove('is-speaking');
                resolve();
            }
        });
    };

    // --- STT using Browser's SpeechRecognition ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-IN'; // You can change this to 'hi-IN' for Hindi
        recognition.interimResults = false;

        recognition.onstart = () => {
            micContainer.classList.add('is-listening');
            voiceStatus.textContent = 'Listening...';
        };

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            processMessage(speechResult); 
        };

        recognition.onend = () => {
            micContainer.classList.remove('is-listening');
            if (!isConversationActive) {
                voiceStatus.textContent = 'Tap the mic to start the conversation';
            }
        };
        
        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            voiceStatus.textContent = 'Sorry, I had trouble hearing. Try again.';
            isConversationActive = false;
        };
    } else {
        document.querySelector('.mode-switcher').style.display = 'none';
        voiceInputMode.style.display = 'none';
    }
    
    // --- Process Message (sends text to Gemini, gets text back) ---
    const processMessage = async (messageText) => {
        if (messageText.trim() === '') return;

        addMessageToChat('user', messageText);
        chatHistory.push({ role: "user", parts: [{ text: messageText }] });
        
        if (!isVoiceMode) userInput.value = '';
        else voiceStatus.textContent = 'Thinking...';

        try {
            const response = await fetch('/process_text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: messageText, history: chatHistory }),
            });

            const data = await response.json();
            addMessageToChat('bot', data.reply);
            chatHistory.push({ role: "model", parts: [{ text: data.reply }] });

            if (isVoiceMode) {
                await speak(data.reply);
                if (isConversationActive) {
                    recognition.start();
                }
            }
        } catch (error) {
            console.error('Error:', error);
            addMessageToChat('bot', 'Sorry, there was a connection error.');
        }
    };

    const addMessageToChat = (sender, text) => {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        const pElement = document.createElement('p');
pElement.textContent = text;
        messageElement.appendChild(pElement);
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
    };
    
    // --- Event Listeners ---
    modeToggle.addEventListener('change', () => {
        isVoiceMode = modeToggle.checked;
        isConversationActive = false;
        if (recognition) recognition.stop();
        
        if (isVoiceMode) {
            textInputMode.style.display = 'none';
            voiceInputMode.style.display = 'flex';
        } else {
            textInputMode.style.display = 'flex';
            voiceInputMode.style.display = 'none';
        }
    });

    sendBtn.addEventListener('click', () => processMessage(userInput.value));
    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') processMessage(userInput.value);
    });

    micBtn.addEventListener('click', () => {
        if (!isConversationActive) {
            isConversationActive = true;
            recognition.start();
        } else {
            isConversationActive = false;
            recognition.stop();
        }
    });
});
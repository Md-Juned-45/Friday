import os
import json
import sqlite3
from gtts import gTTS
from io import BytesIO
import google.generativeai as genai
from flask import Flask, request, jsonify, render_template, Response

# --- CONFIGURATION ---
app = Flask(__name__)

# Get API keys from environment variables
gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key:
    raise ValueError("GEMINI_API_KEY environment variable not set!")

genai.configure(api_key=gemini_api_key)
DB_FILE = "workshop.db"

# --- DATABASE SETUP (Unchanged) ---
def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

@app.cli.command("init-db")
def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS jobs (
            job_id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT, motor_specs TEXT NOT NULL,
            status TEXT DEFAULT 'Pending', price REAL,
            payment_received INTEGER DEFAULT 0,
            date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()
    print("Database has been initialized.")

# --- AI & APP LOGIC ---
SYSTEM_PROMPT = """
You are 'Mistri Dost', a helpful AI assistant for a motor rewinding workshop owner.
You are a VOICE assistant. Your responses are spoken aloud by the system.
If the user mentions they cannot hear you, suggest they check their device's volume.
Always respond with a valid JSON object with a "reply" key.
"""
gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest', system_instruction=SYSTEM_PROMPT)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_text', methods=['POST'])
def process_text():
    data = request.json
    user_text = data.get('text')
    history = data.get('history', [])
    
    try:
        conn = get_db_connection()
        jobs = conn.execute('SELECT * FROM jobs WHERE status = "Pending"').fetchall()
        conn.close()
        job_list = [dict(job) for job in jobs]
        db_context = f"\n--- DATABASE STATE ---\n{json.dumps(job_list)}\n--- END STATE ---"
        
        full_prompt = f"User Message: '{user_text}'\n{db_context}"
        chat = gemini_model.start_chat(history=history)
        response = chat.send_message(full_prompt)
        
        ai_response_text = response.text.strip().replace("```json", "").replace("```", "")
        
        # --- FIX for JSONDecodeError ---
        # Check if the response is valid JSON before trying to load it
        if ai_response_text:
            return jsonify(json.loads(ai_response_text))
        else:
            return jsonify({"reply": "I received an empty response. Please try again."})

    except Exception as e:
        print(f"Error in process_text: {e}")
        # Return a user-friendly error in JSON format
        return jsonify({"reply": "Sorry, I encountered an error. Please rephrase your request."}), 500

@app.route('/synthesize', methods=['POST'])
def synthesize_speech():
    """Receives text and uses gTTS to generate speech audio."""
    try:
        text_to_speak = request.json.get('text')
        if not text_to_speak:
            return jsonify({"error": "No text provided"}), 400
            
        mp3_fp = BytesIO()
        tts = gTTS(text_to_speak, lang='en')
        tts.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        
        return Response(mp3_fp, mimetype="audio/mpeg")
    except Exception as e:
        print(f"gTTS Error: {e}")
        return jsonify({"error": "Failed to synthesize speech"}), 500

if __name__ == '__main__':
    app.run(debug=True)
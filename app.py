import os, sys, json, uuid, datetime
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from flask import Flask, render_template, request, session, jsonify, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from flask_bcrypt import Bcrypt
from google import genai
from google.genai import types, errors
import markdown

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.urandom(24)

# Database Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# User Model
class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), nullable=False, unique=True)
    password = db.Column(db.String(150), nullable=False)
    birth_year = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(50), nullable=False)
    
    @property
    def age(self):
        current_year = datetime.datetime.now().year
        return current_year - self.birth_year

class Report(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    date = db.Column(db.DateTime, default=datetime.datetime.now)
    symptoms = db.Column(db.Text, nullable=False)
    content = db.Column(db.Text, nullable=False) # Storing JSON response

    user = db.relationship('User', backref=db.backref('reports', lazy=True))


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.context_processor
def inject_health_status():
    if current_user.is_authenticated:
        latest_report = Report.query.filter_by(user_id=current_user.id).order_by(Report.date.desc()).first()
        if latest_report:
            try:
                data = json.loads(latest_report.content)
                status = data.get('health_status', 'Moderate')
                # Normalize status
                status = status.strip()
                if 'good' in status.lower():
                    status = 'Good'
                elif 'attention' in status.lower():
                    status = 'Attention needed'
                else:
                    status = 'Moderate'
                return dict(health_status=status)
            except:
                pass
    return dict(health_status=None)
# Initialize Database
with app.app_context():
    db.create_all()

# Global in-memory storage for chat histories (for this mini-project)
CHAT_SESSIONS = {}

# Configure Gemini
GEMINI_API_KEY = "AIzaSyDXaJ559bdkr6OB2d9iNeOdBXZM_hkyfu8"
client = None
if GEMINI_API_KEY:
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:
        print(f"Error configuring Gemini: {e}")
else:
    print("WARNING: GEMINI_API_KEY not set.")

@app.route('/history/<int:report_id>')
@login_required
def view_history_report(report_id):
    report = Report.query.get_or_404(report_id)
    if report.user_id != current_user.id:
        return "Unauthorized", 403
    
    data = json.loads(report.content)
    
    # Reconstruct HTML Report (Same logic as report())
    report_md = f"""
## 1. Possible Causes
{data.get('possible_causes', '')}

## 2. Recommended Actions
{data.get('recommended_actions', '')}

## 3. Recommended Exercises
"""
    exercises = data.get('recommended_exercises', [])
    if not exercises:
            report_md += "(No specific exercises recommended.)\n"
    else:
        for ex in exercises:
            report_md += f"\n### {ex.get('name', 'Exercise')}\n{ex.get('instructions', '')}\n"
        
    report_md += f"""
## 4. When to See a Doctor
{data.get('when_to_see_doctor', '')}

## 5. Disclaimer
{data.get('disclaimer', '')}
"""
    report_content = markdown.markdown(report_md)
    
    # Generate Visuals
    exercises_data = []
    exercises = data.get('recommended_exercises', [])
    if exercises:
        for ex in exercises:
            exercises_data.append({
                "name": ex.get('name'),
                "instructions": ex.get('instructions'),
                "visual_prompt": ex.get('visual_prompt', 'breathing')
            })
    
    return render_template('result.html', 
                           report_content=report_content, 
                           exercises=exercises_data,
                           report_title=data.get('title', 'Historical Report'),
                           doctor_type=data.get('doctor_type', 'General Physician'))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        birth_year = request.form.get('birth_year')
        gender = request.form.get('gender')
        
        user_exists = User.query.filter_by(username=username).first()
        if user_exists:
            flash('Username already exists.', 'error')
            return redirect(url_for('signup'))
            
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        new_user = User(username=username, password=hashed_password, birth_year=int(birth_year), gender=gender)
        db.session.add(new_user)
        db.session.commit()
        
        login_user(new_user)
        return redirect(url_for('assessment'))
        
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.query.filter_by(username=username).first()
        if user and bcrypt.check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('assessment'))
        else:
            flash('Login failed. Check your username and password.', 'error')
            
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

@app.route('/assessment')
@login_required
def assessment():
    return render_template('assessment.html')

@app.route('/api/history')
@login_required
def get_history():
    reports = Report.query.filter_by(user_id=current_user.id).order_by(Report.date.desc()).all()
    history_data = []
    for r in reports:
        # Try to extract title from content JSON
        title = "Health Check"
        try:
            content_data = json.loads(r.content)
            title = content_data.get('title', r.symptoms[:30] + '...')
        except:
            pass
            
        history_data.append({
            'id': r.id,
            'date': r.date.strftime('%Y-%m-%d'),
            'time': r.date.strftime('%H:%M'),
            'title': title,
            'symptoms': r.symptoms
        })
    return jsonify(history_data)

@app.route('/report', methods=['POST'])
@login_required
def report():
    symptoms = request.form.get('symptoms')
    selected_parts = request.form.get('selected_parts')
    height = request.form.get('height')
    weight = request.form.get('weight')
    
    # Use gender from profile
    gender = current_user.gender
    age = current_user.age
    
    # Combine symptoms
    full_symptoms_parts = []
    full_symptoms_parts.append(f"Gender: {gender}")
    full_symptoms_parts.append(f"Age: {age}")
    
    if height:
        full_symptoms_parts.append(f"Height: {height}")
    if weight:
        full_symptoms_parts.append(f"Weight: {weight}")
    if selected_parts:
        full_symptoms_parts.append(f"Affected areas: {selected_parts}")
    if symptoms and symptoms.strip():
        full_symptoms_parts.append(f"Description: {symptoms}")
    
    full_symptoms = ". ".join(full_symptoms_parts)
        
    if not full_symptoms:
        return "Please provide symptoms.", 400

    if not client:
        return "Gemini API not configured.", 500
        
    prompt = f"""
    You are HSync, a helpful and professional health assistant.
    User Context: {full_symptoms}

    Please provide a structured summary report in JSON format.
    The JSON structure must be exactly:
    {{
        "title": "A short, 3-5 word title summarizing the user's main concern (e.g., 'Persistent Headache Analysis' or 'Knee Pain Assessment')",
        "health_status": "One of: 'Good', 'Moderate', 'Attention needed'",
        "possible_causes": "Detailed markdown text for Possible Causes section",
        "recommended_actions": "Detailed markdown text for Recommended Actions section",
        "recommended_exercises": [
            {{
                "name": "Exercise Name",
                "instructions": "Brief instructions",
                "visual_prompt": "Keyword for animation (see list below)"
            }}
        ],
        "when_to_see_doctor": "Detailed markdown text for When to See a Doctor section. Explicitly mention what type of specialist to see (e.g. Cardiologist, Orthopedist).",
        "doctor_type": "The specific type of doctor or specialist recommended (e.g. 'General Physician', 'Dermatologist', 'Physiotherapist')",
        "disclaimer": "Detailed markdown text for Disclaimer"
    }}
    
    For "visual_prompt", you MUST choose the closest match from this EXACT list of supported 3D animations. If the exercise doesn't fit well, default to 'breathing' or 'stretching':
    - "squat": Squats, sit-to-stand, leg strengthening, glute bridges
    - "arm_circle": Arm circles, shoulder mobility, rotator cuff
    - "neck_stretch": Neck tilts, side-to-side, head turns, neck pain relief
    - "shoulder_roll": Shoulder shrugs, rolling shoulders, upper back tension
    - "side_bend": Side stretching, spine flexibility, oblique stretches
    - "high_knee": Marching in place, knee lifts, hip flexion
    - "jumping_jack": Cardio, full body movement, active warmups
    - "forward_bend": Touching toes, hamstring stretch, back stretch, lower back relief
    - "breathing": Deep breathing, meditation, rest, relaxation, stress relief

    Ensure the "markdown text" fields are properly formatted markdown (lists, bolding, etc.) but escaped for JSON if needed.
    For "health_status", assess the severity of the symptoms and physical data provided.
    - "Good": Healthy, minor queries, or maintenance checks.
    - "Moderate": Mild symptoms, discomfort, or borderline health metrics.
    - "Attention needed": Severe pain, concerning symptoms, or significantly poor health metrics.
    Keep it concise, helpful, and empathetic.
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                system_instruction="You are HSync, a helpful and professional health assistant. Respond helpfully and concisely. Use bullet points for lists and keep answers structured with clear line breaks."
            )
        )
        json_text = response.text.strip()
        
        # Clean up code fences just in case
        if json_text.startswith("```json"):
            json_text = json_text[7:]
        elif json_text.startswith("```"):
            json_text = json_text[3:]
        if json_text.endswith("```"):
            json_text = json_text[:-3]
            
        data = json.loads(json_text.strip())
        
        # Save Report to Database
        try:
            new_report = Report(
                user_id=current_user.id,
                symptoms=full_symptoms,
                content=json.dumps(data)
            )
            db.session.add(new_report)
            db.session.commit()
        except Exception as e:
            print(f"Error saving report: {e}")
        
        # Build HTML Report from JSON data
        report_md = f"""
## 1. Possible Causes
{data.get('possible_causes', '')}

## 2. Recommended Actions
{data.get('recommended_actions', '')}

## 3. Recommended Exercises
"""
        exercises = data.get('recommended_exercises', [])
        if not exercises:
             report_md += "(No specific exercises recommended.)\n"
        else:
            for ex in exercises:
                report_md += f"\n### {ex.get('name', 'Exercise')}\n{ex.get('instructions', '')}\n"
            
        report_md += f"""
## 4. When to See a Doctor
{data.get('when_to_see_doctor', '')}

## 5. Disclaimer
{data.get('disclaimer', '')}
"""
        html_content = markdown.markdown(report_md)
        
        # Generate SVGs for exercises
        exercises_data = []
        if exercises:
            for ex in exercises:
                exercises_data.append({
                    "name": ex.get('name'),
                    "instructions": ex.get('instructions'),
                    "visual_prompt": ex.get('visual_prompt', 'breathing') # Pass the keyword
                })
        
        return render_template('result.html', 
                               report_content=html_content, 
                               exercises=exercises_data,
                               report_title=data.get('title', 'Health Assessment'),
                               doctor_type=data.get('doctor_type', 'General Physician'))
    except errors.ClientError as e:
        if e.code == 429:
             return f"Service is temporarily busy (Quota Exceeded). Details: {e}", 429
        return f"Client Error generating report: {e}", 400
    except Exception as e:
        return f"Error generating report: {e}", 500


@app.route('/message', methods=['POST'])
def message():
    data = request.json
    user_text = data.get('text', '')
    
    if not user_text:
        return jsonify({'messages': []})

    if not client:
        return jsonify({'messages': ["I'm sorry, my brain (Gemini API) is not configured correctly."]})

    try:
        # Get or create session ID
        if 'session_id' not in session:
            session['session_id'] = str(uuid.uuid4())
        session_id = session['session_id']
        
        # Retrieve history
        history = CHAT_SESSIONS.get(session_id, [])
        
        # Add user message to history
        history.append(types.Content(role='user', parts=[types.Part.from_text(text=user_text)]))
        
        # Generate response with history
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=history,
            config=types.GenerateContentConfig(
                system_instruction="You are HSync, a helpful and professional health assistant. Respond helpfully and concisely. Use bullet points for lists and keep answers structured with clear line breaks."
            )
        )
        
        # Add model response to history
        history.append(types.Content(role='model', parts=[types.Part.from_text(text=response.text)]))
        
        # Update session history
        CHAT_SESSIONS[session_id] = history
        
        return jsonify({'messages': [response.text]})
    except errors.ClientError as e:
        if e.code == 429:
            return jsonify({'messages': ["Sorry, I am receiving too many requests right now. Please try again in a minute."]}), 429
        print(f"Chat ClientError: {e}")
        return jsonify({'messages': ["Sorry, I encountered a client error."]}), 400
    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({'messages': ["Sorry, I encountered an error processing your request."]}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5001)
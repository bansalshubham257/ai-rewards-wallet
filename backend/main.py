from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from .models import Base, User, Wallet, Transaction, Offer
from pydantic import BaseModel
from passlib.context import CryptContext
import os
import shutil
import json
from openai import OpenAI

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password[:72])

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# Railway DB Connection String
DATABASE_URL = "postgresql://postgres:LZjgyzthYpacmWhOSAnDMnMWxkntEEqe@switchback.proxy.rlwy.net:22297/railway"
SCHEMA_NAME = "ai_rewards_wallet"

# Engine setup
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# OpenAI setup
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Initialize Schema and Tables safely
def init_db():
    with engine.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA_NAME}"))
        try:
            conn.execute(text(f"ALTER TABLE {SCHEMA_NAME}.users ADD COLUMN password_hash VARCHAR"))
        except Exception:
            pass
        try:
            conn.execute(text(f"ALTER TABLE {SCHEMA_NAME}.wallets ADD COLUMN ad_impressions INTEGER DEFAULT 0"))
        except Exception:
            pass
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if db.query(Offer).count() == 0:
            sample_offers = [
                Offer(category="hosting", affiliate_name="Bluehost", base_url="https://bluehost.com", commission_rate=65.0),
                Offer(category="vpn", affiliate_name="NordVPN", base_url="https://nordvpn.com", commission_rate=40.0),
                Offer(category="saas", affiliate_name="HubSpot", base_url="https://hubspot.com", commission_rate=50.0),
                Offer(category="finance", affiliate_name="Amex", base_url="https://americanexpress.com", commission_rate=100.0),
                Offer(category="electronics", affiliate_name="Amazon", base_url="https://amazon.com", commission_rate=5.0),
                Offer(category="travel", affiliate_name="Booking", base_url="https://booking.com", commission_rate=10.0),
                Offer(category="education", affiliate_name="Udemy", base_url="https://udemy.com", commission_rate=15.0),
                Offer(category="health", affiliate_name="MyProtein", commission_rate=20.0),
            ]
            db.add_all(sample_offers)
            db.commit()
    finally:
        db.close()

init_db()

app = FastAPI()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "details": str(exc)},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginSchema(BaseModel):
    email: str
    password: str

class MessageSchema(BaseModel):
    role: str
    text: str

class TransferRequest(BaseModel):
    messages: list[MessageSchema]
    target_ai: str

class TransferResponse(BaseModel):
    summary: str
    current_problem: str
    next_steps: str
    prompt: str

def generate_transfer_prompt(messages, target_ai):
    try:
        chat_history = "\n".join([f"{m['role']}: {m['text']}" for m in messages])
        
        system_prompt = (
            "You are an expert AI Context Transfer agent. Your goal is to summarize a conversation "
            "so it can be continued seamlessly in another AI platform. "
            "Extract: \n"
            "1. Conversation Goal: The main objective of the user.\n"
            "2. Important Context: Technical stack, constraints, decisions made.\n"
            "3. Current Problem: The specific issue currently being discussed.\n"
            "4. Next Steps: What the next AI should do immediately.\n\n"
            "Format the output exactly as a JSON object with keys: summary, current_problem, next_steps, prompt."
        )
        
        user_prompt = f"Here is the conversation history:\n\n{chat_history}\n\nTarget AI: {target_ai}. Please generate the structured handoff."

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        return json.loads(response.choices[0].message.content)
        
    except Exception as e:
        print(f"LLM Error: {e}. Falling back to basic logic.")
        goal = messages[0]['text'] if messages else "Not specified"
        current_problem = messages[-1]['text'] if messages else "Not specified"
        tech_keywords = ['fastapi', 'postgresql', 'react', 'python', 'javascript', 'typescript', 'docker', 'kubernetes', 'aws', 'azure', 'render', 'jwt', 'sqlalchemy', 'prisma']
        found_tech = [kw for kw in tech_keywords if any(kw in m['text'].lower() for m in messages)]
        context_str = ", ".join(found_tech) if found_tech else "General AI assistance"
        adaptations = {
            "chatgpt": "Continue this conversation:\n",
            "claude": "I am transferring a session. Please analyze this context:\n",
            "gemini": "Context Transfer:\n",
            "perplexity": "Research and continue this session:\n"
        }
        prefix = adaptations.get(target_ai, "Continue this conversation:\n")
        
        return {
            "summary": f"Goal: {goal[:100]}... | Tech: {context_str}",
            "current_problem": current_problem,
            "next_steps": "Continue from the last message.",
            "prompt": f"{prefix}\n\nGoal: {goal}\n\nContext: {context_str}\n\nCurrent Problem: {current_problem}"
        }

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/auth/login")
async def login(data: LoginSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        hashed_password = get_password_hash(data.password)
        user = User(email=data.email, password_hash=hashed_password)
        db.add(user)
        db.commit()
        wallet = Wallet(email=data.email, current_balance=0.0)
        db.add(wallet)
        db.commit()
    else:
        if not verify_password(data.password, user.password_hash):
            raise HTTPException(status_code=400, detail="Incorrect password")
    return {"status": "success", "email": user.email}

@app.post("/analyze/intent")
async def analyze_intent(data: dict, db: Session = Depends(get_db)):
    prompt = data.get("prompt", "").lower()
    email = data.get("email", "")
    categories = {
        "hosting": ["hosting", "domain", "server", "aws", "azure", "bluehost", "hostinger", "website"],
        "vpn": ["vpn", "privacy", "expressvpn", "nordvpn", "surfshark", "proxy"],
        "saas": ["crm", "software", "automation", "tool", "salesforce", "hubspot", "productivity"],
        "finance": ["credit card", "loan", "insurance", "bank", "trading", "investment", "stocks"],
        "electronics": ["laptop", "pc", "macbook", "iphone", "gpu", "monitor", "keyboard", "headphones", "gadget"],
        "travel": ["flight", "hotel", "booking", "airbnb", "vacation", "trip", "resort", "rental car"],
        "education": ["course", "certification", "udemy", "coursera", "learning", "degree", "bootcamp"],
        "health": ["supplements", "vitamins", "gym", "fitness", "workout", "health insurance"]
    }
    found_cat = "general"
    for cat, keywords in categories.items():
        if any(k in prompt for k in keywords):
            found_cat = cat
            break
    if found_cat == "general":
        return {"category": "none", "offer_id": None}
    offer = db.query(Offer).filter(Offer.category == found_cat, Offer.is_active == True).first()
    if offer:
        separator = "&" if "?" in offer.base_url else "?"
        tracking_link = f"{offer.base_url}{separator}subid={email}"
        return {"category": found_cat, "offer_id": offer.offer_id, "url": tracking_link, "recommendation": f"Top rated {found_cat} offer for you!"}
    return {"category": found_cat, "offer_id": None, "message": "No current offers for this category."}

@app.get("/wallet/balance")
async def get_balance(email: str, db: Session = Depends(get_db)):
    wallet = db.query(Wallet).filter(Wallet.email == email).first()
    return {"balance": wallet.current_balance if wallet else 0}

@app.post("/user/update-upi")
async def update_upi(email: str, upi: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.upi_id = upi
    db.commit()
    return {"status": "success", "message": "UPI ID updated successfully"}

@app.post("/track/ad-impression")
async def track_ad_impression(email: str, db: Session = Depends(get_db)):
    wallet = db.query(Wallet).filter(Wallet.email == email).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    wallet.ad_impressions = (wallet.ad_impressions or 0) + 1
    db.commit()
    return {"status": "success", "ad_impressions": wallet.ad_impressions}

@app.post("/conversation-transfer", response_model=TransferResponse)
async def conversation_transfer(data: TransferRequest):
    messages = [m.dict() for m in data.messages]
    target_ai = data.target_ai
    result = generate_transfer_prompt(messages, target_ai)
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

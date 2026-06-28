from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from models import Base, User, Wallet, Transaction
from pydantic import BaseModel
import os
import shutil

# Railway DB Connection String
DATABASE_URL = "postgresql://postgres:LZjgyzthYpacmWhOSAnDMnMWxkntEEqe@switchback.proxy.rlwy.net:22297/railway"
SCHEMA_NAME = "ai_rewards_wallet"

# Engine setup
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Initialize Schema and Tables safely
def init_db():
    with engine.connect() as conn:
        # Create separate schema to avoid touching public/GST data
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA_NAME}"))
        conn.commit()
    Base.metadata.create_all(bind=engine)

init_db()

app = FastAPI()

class LoginSchema(BaseModel):
    email: str
    upi: str

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
        user = User(email=data.email, upi_id=data.upi)
        db.add(user)
        db.commit()
        # Create corresponding wallet in the new schema
        wallet = Wallet(email=data.email, current_balance=0.0)
        db.add(wallet)
        db.commit()
    return {"status": "success", "email": user.email}

@app.post("/analyze/intent")
async def analyze_intent(data: dict, db: Session = Depends(get_db)):
    prompt = data.get("prompt", "").lower()
    categories = {
        "hosting": ["hosting", "domain", "server", "aws", "azure"],
        "vpn": ["vpn", "privacy", "expressvpn", "nordvpn"],
        "saas": ["crm", "software", "automation", "tool"],
        "finance": ["credit card", "loan", "insurance", "bank"]
    }
    
    found_cat = "general"
    for cat, keywords in categories.items():
        if any(k in prompt for k in keywords):
            found_cat = cat
            break
    
    if found_cat == "general":
        return {"category": "none", "offer_id": None}
        
    return {
        "category": found_cat,
        "commercial_score": 90,
        "offer_id": f"OFFER_{found_cat.upper()}_001",
        "recommendation": f"Check out the best {found_cat} tools!"
    }

@app.get("/wallet/balance")
async def get_balance(email: str, db: Session = Depends(get_db)):
    wallet = db.query(Wallet).filter(Wallet.email == email).first()
    return {"balance": wallet.current_balance if wallet else 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

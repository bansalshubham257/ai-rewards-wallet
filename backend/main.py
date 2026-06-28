from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from .models import Base, User, Wallet, Transaction
from pydantic import BaseModel
import os
import shutil
import torch

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
        
    # Fetch the best active offer for this category from DB
    offer = db.query(Offer).filter(Offer.category == found_cat, Offer.is_active == True).first()
    
    if offer:
        # Append the user email as subid for tracking
        # Example: https://link.com/?aff=123&subid=user@email.com
        separator = "&" if "?" in offer.base_url else "?"
        tracking_link = f"{offer.base_url}{separator}subid={email}"
        
        return {
            "category": found_cat,
            "offer_id": offer.offer_id,
            "url": tracking_link,
            "recommendation": f"Top rated {found_cat} offer for you!"
        }
    
    return {"category": found_cat, "offer_id": None, "message": "No current offers for this category."}

@app.get("/wallet/balance")
async def get_balance(email: str, db: Session = Depends(get_db)):
    wallet = db.query(Wallet).filter(Wallet.email == email).first()
    return {"balance": wallet.current_balance if wallet else 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

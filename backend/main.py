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

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    # bcrypt has a maximum password length of 72 bytes
    return pwd_context.hash(password[:72])

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# Railway DB Connection String
DATABASE_URL = "postgresql://postgres:LZjgyzthYpacmWhOSAnDMnMWxkntEEqe@switchback.proxy.rlwy.net:22297/railway"
SCHEMA_NAME = "ai_rewards_wallet"

# Engine setup
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Initialize Schema and Tables safely
def init_db():
    # Use engine.begin() to ensure transaction is committed
    with engine.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA_NAME}"))
        
        # Try to add the column. If the table doesn't exist yet, it will fail, 
        # but create_all() will handle table creation with the correct schema.
        try:
            conn.execute(text(f"ALTER TABLE {SCHEMA_NAME}.users ADD COLUMN password_hash VARCHAR"))
        except Exception:
            # Either column already exists or table doesn't exist yet
            pass
            
    Base.metadata.create_all(bind=engine)

    # Seed sample offers if the table is empty
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
                Offer(category="health", affiliate_name="MyProtein", base_url="https://myprotein.com", commission_rate=20.0),
            ]
            db.add_all(sample_offers)
            db.commit()
            print("Successfully seeded sample offers.")
    finally:
        db.close()

init_db()

app = FastAPI()

# Global error handler for debugging
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": "Internal Server Error", "details": str(exc)},
    )

# Add CORS middleware to allow requests from the browser extension
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
        # Sign up new user
        hashed_password = get_password_hash(data.password)
        user = User(email=data.email, password_hash=hashed_password)
        db.add(user)
        db.commit()
        # Create corresponding wallet
        wallet = Wallet(email=data.email, current_balance=0.0)
        db.add(wallet)
        db.commit()
    else:
        # Verify password for existing user
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

@app.post("/user/update-upi")
async def update_upi(email: str, upi: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.upi_id = upi
    db.commit()
    return {"status": "success", "message": "UPI ID updated successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

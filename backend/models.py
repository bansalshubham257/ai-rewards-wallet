from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime

# Using a dedicated schema to avoid messing with existing data in 'public'
SCHEMA_NAME = "ai_rewards_wallet"
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": SCHEMA_NAME}
    email = Column(String, primary_key=True, index=True)
    password_hash = Column(String)
    upi_id = Column(String, nullable=True)
    country = Column(String, default="US")
    referred_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = {"schema": SCHEMA_NAME}
    offer_id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String, index=True) # e.g., 'hosting', 'vpn'
    affiliate_name = Column(String) # e.g., 'PartnerStack', 'Impact'
    base_url = Column(String) # The link from the network
    commission_rate = Column(Float) # How much you earn per sale
    is_active = Column(Boolean, default=True)

class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = {"schema": SCHEMA_NAME}
    email = Column(String, ForeignKey(f"{SCHEMA_NAME}.users.email"), primary_key=True)
    current_balance = Column(Float, default=0.0)
    lifetime_earnings = Column(Float, default=0.0)

class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = {"schema": SCHEMA_NAME}
    tx_id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, ForeignKey(f"{SCHEMA_NAME}.users.email"))
    amount = Column(Float)
    type = Column(String) # 'PENDING' or 'AVAILABLE'
    source = Column(String) # Affiliate Name
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

"""Pydantic models for the promotion module."""
from pydantic import BaseModel
from typing import Optional
from datetime import date


class ContentPost(BaseModel):
    post_type: str
    channel: str
    generated_text: str
    status: str = "pending"
    scheduled_date: date
    posted_at: Optional[str] = None
    error: Optional[str] = None


class GeneratedContent(BaseModel):
    competitive_tonight: str
    club_spotlight: str
    heatmap_weekly: str  # empty string on non-Monday runs

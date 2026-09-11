"""
email_service.py

Sends the generated temp password to a newly created user. Uses plain SMTP
so it works with any provider (Gmail app password, SendGrid SMTP relay,
Zoho, etc.) — swap for an API-based sender later if you prefer.

Required env vars:
    SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL
Optional:
    SMTP_USE_TLS (default "true")
"""

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() != "false"

APP_NAME = os.environ.get("APP_NAME", "Matching Automation")


def send_temp_password_email(to_email: str, temp_password: str, login_url: str | None = None) -> None:
    if not (SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD):
        # Fail loudly rather than silently skipping — an admin needs to know
        # the user has no way to get their password otherwise.
        raise RuntimeError(
            "SMTP is not configured (SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD). "
            "Cannot send the temp password email."
        )

    msg = EmailMessage()
    msg["Subject"] = f"Your {APP_NAME} account"
    msg["From"] = SMTP_FROM_EMAIL
    msg["To"] = to_email

    body = (
        f"An account has been created for you on {APP_NAME}.\n\n"
        f"Email: {to_email}\n"
        f"Temporary password: {temp_password}\n\n"
        "You'll be required to set a new password the first time you log in.\n"
    )
    if login_url:
        body += f"\nLog in here: {login_url}\n"

    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        if SMTP_USE_TLS:
            server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)

    logger.info("Sent temp password email to %s", to_email)

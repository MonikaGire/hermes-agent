"""
Website contact extractor using Crawl4AI.
Crawls company websites to find emails, phones, WhatsApp numbers.
Falls back to plain fetch + regex if Crawl4AI fails.
"""
import re
import asyncio
from typing import Optional

SKIP_EMAIL = re.compile(
    r"noreply|no-reply|donotreply|example\.com|@sentry|@w3\.|privacy@|legal@|press@|support@|help@",
    re.I,
)


def _extract_from_html(html: str) -> dict:
    """Regex-based contact extraction from raw HTML."""
    contacts: dict = {"emails": [], "phones": [], "whatsapp": []}
    seen: set = set()

    def add(key: str, val: str) -> None:
        v = val.strip()
        if v.lower() not in seen:
            seen.add(v.lower())
            contacts[key].append(v)

    # Emails
    for email in re.findall(r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b", html):
        if not SKIP_EMAIL.search(email):
            add("emails", email.lower())

    # Phones — priority 1: tel: href links
    for phone in re.findall(r'href=["\']tel:([+\d\s\-().]{7,20})["\']', html, re.I):
        digits = re.sub(r"\D", "", phone)
        if 7 <= len(digits) <= 15:
            add("phones", phone)

    # Phones — priority 2: near phone keywords (only if no tel: found)
    if not contacts["phones"]:
        stripped = re.sub(r"<[^>]+>", " ", html)
        for m in re.finditer(
            r"(?:phone|mobile|tel|call|whatsapp|contact)[^\d]{0,20}(\+?[\d][\d\s\-().]{5,16}[\d])",
            stripped,
            re.I,
        ):
            digits = re.sub(r"\D", "", m.group(1))
            if 7 <= len(digits) <= 13:
                add("phones", m.group(1))

    # WhatsApp
    for wa in re.findall(r"wa\.me/([+\d]+)", html):
        add("whatsapp", f"+{re.sub(chr(92) + 'D', '', wa)}")

    return contacts


async def _crawl_with_crawl4ai(url: str) -> Optional[str]:
    """Returns raw HTML from crawl4ai, or None on failure."""
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

        browser_config = BrowserConfig(headless=True, verbose=False)
        run_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            word_count_threshold=20,
            remove_overlay_elements=True,
            page_timeout=15000,
        )
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)
            if result.success:
                return result.html or ""
    except Exception:
        pass
    return None


async def _crawl_with_fetch(url: str) -> Optional[str]:
    """Plain httpx fetch fallback."""
    try:
        import httpx

        async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
            r = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (compatible; HermesBot/1.0)"},
            )
            return r.text
    except Exception:
        return None


async def crawl_website_contacts(url: str) -> dict:
    """
    Try contact/about pages, combine contacts from all pages.
    Returns: { emails: [], phones: [], whatsapp: [] }
    """
    if not url.startswith("http"):
        url = f"https://{url}"

    base = url.rstrip("/")
    pages_to_try = [
        base,
        f"{base}/contact",
        f"{base}/contact-us",
        f"{base}/about",
    ]

    all_contacts: dict = {"emails": [], "phones": [], "whatsapp": []}
    seen_values: set = set()

    def merge(contacts: dict) -> None:
        for key, vals in contacts.items():
            for v in vals:
                if v.lower() not in seen_values:
                    seen_values.add(v.lower())
                    all_contacts[key].append(v)

    for page_url in pages_to_try[:3]:
        # Try crawl4ai first, fall back to plain fetch
        html = await _crawl_with_crawl4ai(page_url)
        if not html:
            html = await _crawl_with_fetch(page_url)
        if not html:
            continue

        page_contacts = _extract_from_html(html)
        merge(page_contacts)

        # Stop early if we have both email and phone
        if all_contacts["emails"] and all_contacts["phones"]:
            break

    return all_contacts

"""
Hermes Scraper Service — Flask microservice on port 5001
Google Maps scraping + Crawl4AI website contact extraction.
"""
import asyncio
import json
from flask import Flask, request, jsonify

app = Flask(__name__)


def run_async(coro):
    """Run an async coroutine from sync Flask context using a fresh event loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@app.get("/health")
def health():
    playwright_ok = False
    try:
        from playwright.async_api import async_playwright  # noqa: F401
        playwright_ok = True
    except ImportError:
        pass
    return jsonify({
        "status": "ok" if playwright_ok else "degraded",
        "service": "hermes-scraper",
        "playwright": playwright_ok,
        "fix": None if playwright_ok else "Run: playwright install chromium",
    })


@app.post("/maps/search")
def maps_search():
    try:
        from playwright.async_api import async_playwright  # noqa: F401
    except ImportError:
        return jsonify({"detail": "Playwright not installed. Run: playwright install chromium"}), 503

    body = request.get_json(force=True) or {}
    industry = body.get("industry", "Machinery")
    location = body.get("location", "India")
    keywords = body.get("keywords", "")
    limit = int(body.get("limit", 20))

    parts = ([keywords] if keywords else []) + [industry, "manufacturer", location]
    query = " ".join(parts)

    from scrapers.google_maps import scrape_google_maps
    from scrapers.website import crawl_website_contacts

    try:
        raw_leads = run_async(scrape_google_maps(query, limit))
    except Exception as exc:
        return jsonify({"detail": f"Maps scrape failed: {exc}. Run: playwright install chromium"}), 503

    # Enrich with website contacts
    async def enrich_all(leads):
        async def enrich(lead):
            if not lead.get("website"):
                lead["emails"] = []
                lead["whatsapp"] = []
                return lead
            try:
                contacts = await asyncio.wait_for(
                    crawl_website_contacts(lead["website"]), timeout=12
                )
                lead["emails"] = contacts.get("emails", [])
                lead["whatsapp"] = contacts.get("whatsapp", [])
                if not lead.get("phone") and contacts.get("phones"):
                    lead["phone"] = contacts["phones"][0]
            except Exception:
                lead["emails"] = []
                lead["whatsapp"] = []
            return lead
        return await asyncio.gather(*[enrich(l) for l in leads])

    enriched = run_async(enrich_all(raw_leads))

    total = len(enriched)
    with_website = sum(1 for l in enriched if l.get("website"))
    with_phone = sum(1 for l in enriched if l.get("phone"))
    with_email = sum(1 for l in enriched if l.get("emails"))

    return jsonify({
        "leads": enriched,
        "total": total,
        "query": query,
        "metrics": {
            "total": total,
            "with_website": with_website,
            "with_phone": with_phone,
            "with_email": with_email,
            "pct_website": round(with_website / total * 100) if total else 0,
            "pct_phone": round(with_phone / total * 100) if total else 0,
            "pct_email": round(with_email / total * 100) if total else 0,
        },
    })


@app.post("/crawl/website")
def crawl_website():
    body = request.get_json(force=True) or {}
    url = body.get("url", "")
    if not url:
        return jsonify({"detail": "url required"}), 400

    from scrapers.website import crawl_website_contacts
    try:
        contacts = run_async(asyncio.wait_for(crawl_website_contacts(url), timeout=20))
        return jsonify(contacts)
    except asyncio.TimeoutError:
        return jsonify({"detail": "Website crawl timed out"}), 408
    except Exception as exc:
        return jsonify({"detail": str(exc)}), 500


if __name__ == "__main__":
    print("Hermes Scraper Service starting on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=False)

"""
Google Maps scraper using Playwright.
Searches for businesses and extracts: name, phone, website, address, rating, category.
"""
import asyncio
import re
from typing import Optional


async def scrape_google_maps(query: str, limit: int = 20) -> list[dict]:
    from playwright.async_api import async_playwright

    results: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        encoded = query.replace(" ", "+")
        await page.goto(
            f"https://www.google.com/maps/search/{encoded}",
            wait_until="domcontentloaded",
            timeout=30000,
        )

        # Dismiss cookie consent if shown (Europe)
        for selector in ['button[aria-label="Accept all"]', 'button[jsname="b3VHJd"]']:
            try:
                await page.click(selector, timeout=3000)
                break
            except Exception:
                pass

        # Wait for results feed
        try:
            await page.wait_for_selector('div[role="feed"]', timeout=12000)
        except Exception:
            await browser.close()
            return []

        # Scroll to collect place detail URLs
        place_urls: list[str] = []
        seen: set[str] = set()
        stale_rounds = 0

        while len(place_urls) < limit and stale_rounds < 5:
            prev = len(place_urls)

            links = await page.query_selector_all('a[href*="/maps/place/"]')
            for link in links:
                href = await link.get_attribute("href") or ""
                if "/maps/place/" not in href:
                    continue
                # Use the clean maps place URL
                clean = re.split(r"\?|/data=", href)[0]
                if clean not in seen:
                    seen.add(clean)
                    place_urls.append(href)

            if len(place_urls) == prev:
                stale_rounds += 1
            else:
                stale_rounds = 0

            if len(place_urls) < limit:
                await page.evaluate(
                    "const f = document.querySelector('div[role=\"feed\"]'); if(f) f.scrollTop += 1000;"
                )
                await page.wait_for_timeout(1000)

        # Visit each place detail page
        for url in place_urls[:limit]:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=12000)
                await page.wait_for_timeout(800)

                lead: dict = {"source": "google_maps", "maps_url": url}

                # Name (required)
                try:
                    name_el = await page.wait_for_selector(
                        "h1.fontHeadlineLarge, h1[class*='fontHeadline']", timeout=4000
                    )
                    name = (await name_el.inner_text()).strip()
                    if not name:
                        continue
                    lead["name"] = name
                except Exception:
                    continue

                # Category
                try:
                    cat_el = await page.query_selector("button.DkEaL")
                    if cat_el:
                        lead["category"] = (await cat_el.inner_text()).strip()
                except Exception:
                    pass

                # Rating
                try:
                    rating_el = await page.query_selector('div[class*="fontDisplayLarge"]')
                    if rating_el:
                        m = re.search(r"([\d.]+)", await rating_el.inner_text())
                        if m:
                            lead["rating"] = float(m.group(1))
                    # Review count
                    rev_el = await page.query_selector('button[jsaction*="reviewChart"]')
                    if rev_el:
                        rm = re.search(r"([\d,]+)", await rev_el.inner_text())
                        if rm:
                            lead["review_count"] = int(rm.group(1).replace(",", ""))
                except Exception:
                    pass

                # Address
                try:
                    for sel in [
                        '[data-item-id="address"] div.fontBodyMedium',
                        'button[data-item-id="address"] div.fontBodyMedium',
                        '[data-tooltip="Copy address"] div.fontBodyMedium',
                    ]:
                        addr_el = await page.query_selector(sel)
                        if addr_el:
                            lead["address"] = (await addr_el.inner_text()).strip()
                            break
                except Exception:
                    pass

                # Phone — try multiple selector strategies
                try:
                    phone_btns = await page.query_selector_all('button[data-item-id^="phone"]')
                    for btn in phone_btns:
                        aria = await btn.get_attribute("aria-label") or ""
                        phone_match = re.search(r"Phone:\s*(.+)", aria)
                        if phone_match:
                            lead["phone"] = phone_match.group(1).strip()
                            break
                    if "phone" not in lead:
                        # Fallback: look for tel: links rendered on page
                        tel_links = await page.query_selector_all('a[href^="tel:"]')
                        for tl in tel_links:
                            href_val = await tl.get_attribute("href") or ""
                            raw = href_val.replace("tel:", "").strip()
                            digits = re.sub(r"\D", "", raw)
                            if 7 <= len(digits) <= 15:
                                lead["phone"] = raw
                                break
                except Exception:
                    pass

                # Website
                try:
                    site_el = await page.query_selector('a[data-item-id="authority"]')
                    if site_el:
                        lead["website"] = await site_el.get_attribute("href")
                except Exception:
                    pass

                results.append(lead)

            except Exception:
                continue

        await browser.close()

    return results

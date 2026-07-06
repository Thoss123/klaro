#!/usr/bin/env python3
"""Herold.at Immobilienmakler scraper — Firmen mit E-Mail, Webseite und Ansprechpartner."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass, field
from html import unescape
from typing import Iterable

BASE = "https://www.herold.at"
LISTING_PATH = "/gelbe-seiten/immobilienmakler/"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

ROLE_KEYWORDS = (
    "geschäftsführer",
    "geschäftsführerin",
    "inhaber",
    "inhaberin",
    "ceo",
    "leitung",
    "vorstand",
    "prokurist",
    "partner",
    "geschäftsleitung",
)

IMPRESSUM_PATHS = (
    "/impressum",
    "/impressum/",
    "/kontakt/impressum",
    "/de/impressum",
)

IMPRESSUM_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"(?:Geschäftsführer(?:in)?|Geschäftsführung|Inhaber(?:in)?|"
            r"CEO|Managing Director|Geschäftsleitung|Leitung)\s*:?\s*"
            r"((?:Mag\.|Dr\.|DI|Ing\.|Dkfm\.|MMag\.|BSc\.|MSc\.)\s*)?"
            r"([A-ZÄÖÜ][A-Za-zäöüß\-.]+(?:\s+[A-ZÄÖÜ][A-Za-zäöüß\-.]+){0,4})",
            re.I,
        ),
        "Geschäftsführung",
    ),
    (
        re.compile(
            r"((?:Mag\.|Dr\.|DI|Ing\.|Dkfm\.|MMag\.)\s+"
            r"[A-ZÄÖÜ][A-Za-zäöüß\-.]+(?:\s+[A-ZÄÖÜ][A-Za-zäöüß\-.]+){0,3})"
            r"\s*[,–-]\s*(?:Geschäftsf|Inhaber|CEO|Leitung)",
            re.I,
        ),
        "Geschäftsführung",
    ),
]

BAD_PERSON_TOKENS = {
    "der",
    "die",
    "das",
    "des",
    "dem",
    "den",
    "ein",
    "eine",
    "einer",
    "eines",
    "dieses",
    "dieser",
    "diesem",
    "diesen",
    "eses",
    "unternehmens",
    "unternehmen",
    "website",
    "internetseite",
    "internet",
    "impressum",
    "kontakt",
    "team",
    "news",
    "top",
    "projekte",
    "bankverbindung",
    "umsatzsteuer",
    "standort",
    "zuständige",
    "aufsichtsbehörde",
    "landesgericht",
    "information",
    "tel",
    "kontakt",
    "gesellschafter",
    "umsatzsteuer",
    "bm",
    "hr",
    "fr",
}


@dataclass
class Company:
    name: str
    email: str
    website: str
    contact_person: str = ""
    contact_role: str = ""
    contact_source: str = ""
    phone: str = ""
    address: str = ""
    city: str = ""
    postal_code: str = ""
    detail_url: str = ""
    herold_id: str = ""
    extra_contacts: list[dict[str, str]] = field(default_factory=list)


def fetch(url: str, timeout: int = 30, retries: int = 5) -> str:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt + 1 < retries:
                time.sleep(min(2 ** attempt, 8))
                continue
            raise
    if last_error:
        raise last_error
    raise RuntimeError(f"fetch failed for {url}")


def normalize_website(url: str) -> str:
    url = unescape(url.strip())
    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    parsed = urllib.parse.urlparse(url)
    if not parsed.scheme:
        url = "https://" + url.lstrip("/")
    return url.rstrip("/")


def is_valid_external_url(url: str) -> bool:
    if not url:
        return False
    lower = url.lower()
    blocked = (
        "herold.at",
        "facebook.com",
        "instagram.com",
        "youtube.com",
        "linkedin.com",
        "twitter.com",
        "x.com",
        "google.",
        "schema.org",
        "w3.org",
        "ihr-feedback.at",
        "arztsuche24.at",
    )
    return not any(b in lower for b in blocked)


def parse_listing_page(html: str) -> tuple[list[Company], int | None]:
    articles = re.findall(
        r'<article[^>]*itemType="https://schema.org/LocalBusiness"[\s\S]*?</article>',
        html,
        re.I,
    )
    companies: list[Company] = []
    for art in articles:
        name_m = re.search(r'itemProp="name"\s+content="([^"]+)"', art)
        ident_m = re.search(r'itemProp="identifier"\s+content="([^"]+)"', art)
        email_m = re.search(r'href="mailto:([^"?]+)', art, re.I)
        website_m = re.search(r'itemProp="url"\s+content="([^"]+)"', art)
        if not website_m:
            for u in re.findall(r'href="(https?://[^"]+)"', art):
                if is_valid_external_url(u):
                    website_m = re.match(r".*", u)
                    website_m = type("M", (), {"group": lambda _self, n=1, u=u: u})()
                    break
        detail_m = re.search(r'href="(/gelbe-seiten/[^"]+/)"', art)
        phone_m = re.search(r'href="tel:([^"]+)"', art)
        street_m = re.search(r'itemProp="streetAddress"\s+content="([^"]+)"', art)
        city_m = re.search(r'itemProp="addressLocality"\s+content="([^"]+)"', art)
        plz_m = re.search(r'itemProp="postalCode"\s+content="([^"]+)"', art)

        if not name_m:
            continue

        email = (email_m.group(1).strip() if email_m else "").lower()
        website = normalize_website(website_m.group(1) if website_m else "")
        if not email or not website or not is_valid_external_url(website):
            continue

        companies.append(
            Company(
                name=unescape(name_m.group(1)).strip(),
                email=email,
                website=website,
                phone=unescape(phone_m.group(1)).strip() if phone_m else "",
                address=unescape(street_m.group(1)).strip() if street_m else "",
                city=unescape(city_m.group(1)).strip() if city_m else "",
                postal_code=unescape(plz_m.group(1)).strip() if plz_m else "",
                detail_url=(BASE + detail_m.group(1)) if detail_m else "",
                herold_id=ident_m.group(1) if ident_m else "",
            )
        )

    page_count = None
    m = re.search(r"Seite\s+\d+/(\d+)", html, re.I)
    if m:
        page_count = int(m.group(1))
    return companies, page_count


def _clean_person(name: str) -> str:
    name = re.sub(r"\s+", " ", unescape(name)).strip(" ,.-/")
    name = re.sub(r"\b(GmbH|OG|KG|e\.U\.|Ges\.m\.b\.H\.?)\b", "", name, flags=re.I).strip()
    skip_prefixes = (
        "geschäftsführung",
        "geschäftsführer",
        "geschäftsführerin",
        "inhaber",
        "inhaberin",
        "hr.",
        "fr.",
    )
    lower = name.lower()
    for prefix in skip_prefixes:
        if lower.startswith(prefix + " "):
            name = name[len(prefix) :].strip()
            break
    parts: list[str] = []
    for part in name.split():
        token = part.lower().rstrip(".,;:")
        if token in BAD_PERSON_TOKENS:
            break
        parts.append(part)
        if len(parts) >= 4:
            break
    return " ".join(parts)


def _join_person_match(match: re.Match[str]) -> str:
    if match.lastindex and match.lastindex >= 2 and match.group(2):
        prefix = (match.group(1) or "").strip()
        core = match.group(2).strip()
        return _clean_person(f"{prefix}{core}")
    return _clean_person(match.group(1))


def is_plausible_person(name: str) -> bool:
    name = _clean_person(name)
    if not name or len(name) < 4 or len(name) > 80:
        return False
    if any(ch.isdigit() for ch in name):
        return False
    lower = name.lower()
    if any(bad in lower for bad in ("http", "www.", "@", "gmbh", " kg", " og", ".at", ".com")):
        return False
    parts = [p for p in re.split(r"\s+", name) if p]
    if not parts:
        return False
    if len(parts) == 1 and parts[0].lower() in BAD_PERSON_TOKENS:
        return False
    alpha_parts = [p for p in parts if not re.fullmatch(r"(?:Mag\.|Dr\.|DI|Ing\.|Dkfm\.|MMag\.|BSc\.|MSc\.)", p)]
    if not alpha_parts:
        return False
    if sum(1 for p in alpha_parts if p.lower() in BAD_PERSON_TOKENS) >= max(1, len(alpha_parts) // 2):
        return False
    titled = bool(re.match(r"^(?:Mag\.|Dr\.|DI|Ing\.|Dkfm\.|MMag\.)", name))
    if len(alpha_parts) >= 2 or titled:
        return True
    return len(alpha_parts[0]) >= 4 and alpha_parts[0][0].isupper()


def extract_from_company_name(name: str) -> tuple[str, str] | None:
    patterns: list[tuple[re.Pattern[str], str]] = [
        (re.compile(r"/\s*Inhaber(?:in)?\s+(.+)$", re.I), "Inhaber"),
        (re.compile(r"\bInhaber(?:in)?\s+(.+)$", re.I), "Inhaber"),
        (re.compile(r"-\s*((?:Mag\.|Dr\.|DI|Ing\.|Dkfm\.|MMag\.)(?:\s+\w+\.)?\s*.+)$", re.I), "Geschäftsführung"),
        (re.compile(r"-\s*([A-ZÄÖÜ][A-Za-zäöüß\-]+(?:\s+[A-ZÄÖÜ][A-Za-zäöüß\-]+)+)$"), "Geschäftsführung"),
        (re.compile(r"\b([A-ZÄÖÜ][A-Za-zäöüß\-]+)\s+([A-ZÄÖÜ][A-Za-zäöüß\-]+)\s+e\.U\.?", re.I), "Inhaber"),
        (re.compile(r"\bImmobilien\s+([A-ZÄÖÜ][A-Za-zäöüß\-]+(?:\s+[A-ZÄÖÜ][A-Za-zäöüß\-]+)+)$", re.I), "Inhaber"),
        (re.compile(r"\b([A-ZÄÖÜ][A-Za-zäöüß\-]+)-Immobilien\s+([A-ZÄÖÜ][A-Za-zäöüß\-]+)$", re.I), "Inhaber"),
        (re.compile(r"\b([A-ZÄÖÜ][A-Za-zäöüß\-]+)\s+([A-ZÄÖÜ][A-Za-zäöüß\-]+)\s*/\s*([A-ZÄÖÜ][A-Za-zäöüß\-]+)$"), "Inhaber"),
        (re.compile(r"\bMag\.?\s+([A-ZÄÖÜ][A-Za-zäöüß\-]+)\s+([A-ZÄÖÜ][A-Za-zäöüß\-]+)$", re.I), "Geschäftsführung"),
    ]
    for pat, role in patterns:
        m = pat.search(name)
        if not m:
            continue
        if pat.pattern.startswith(r"\bMag"):
            person = _clean_person(f"Mag. {' '.join(m.groups())}")
        elif m.lastindex and m.lastindex >= 2:
            person = _clean_person(" ".join(m.groups()))
        else:
            person = _clean_person(m.group(1))
        if is_plausible_person(person):
            return person, role
    return None


def extract_from_detail_slug(detail_url: str) -> tuple[str, str] | None:
    slug = detail_url.rstrip("/").split("/")[-1]
    m = re.search(r"inhaber(?:in)?-(.+)$", slug, re.I)
    if m:
        parts = m.group(1).replace("-", " ").split()
        if len(parts) >= 2:
            person = " ".join(
                p if p.isupper() and len(p) > 2 else p.title()
                for p in parts
            )
            if is_plausible_person(person):
                return person, "Inhaber"
    m = re.search(
        r"(mag-jur-|mag-|dr-)([a-zäöüß\-]+(?:-[a-zäöüß]+)*)",
        slug,
        re.I,
    )
    if m:
        person = m.group(2).replace("-", " ").title()
        prefix = "Mag." if "mag" in m.group(1).lower() else "Dr."
        return f"{prefix} {person}", "Geschäftsführung"
    return None


def extract_from_detail_page(html: str) -> tuple[str, str] | None:
    title_m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
    if title_m:
        title = unescape(title_m.group(1))
        m = re.search(r"/\s*Inhaber(?:in)?\s+([^|]+?)\s+in\s+\d", title, re.I)
        if m:
            person = _clean_person(m.group(1))
            if is_plausible_person(person):
                return person, "Inhaber"

    return None


def extract_from_website(website: str, timeout: int = 10) -> tuple[str, str] | None:
    parsed = urllib.parse.urlparse(website)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    candidates = [origin + "/impressum", origin + "/impressum/"]

    seen: set[str] = set()
    for url in candidates:
        if url in seen:
            continue
        seen.add(url)
        try:
            html = fetch(url, timeout=timeout)
        except (urllib.error.URLError, TimeoutError, ValueError):
            continue
        text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
        text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", unescape(text))
        for pat, role in IMPRESSUM_PATTERNS:
            m = pat.search(text)
            if not m:
                continue
            person = _join_person_match(m)
            if is_plausible_person(person):
                return person, role
    return None


def pick_contact(company: Company, detail_html: str | None, scrape_websites: bool) -> Company:
    candidates: list[tuple[str, str, str, int]] = []

    def add(person: str | None, role: str, source: str, score: int) -> None:
        if not person:
            return
        person = _clean_person(person)
        if not is_plausible_person(person):
            return
        candidates.append((person, role, source, score))

    hit = extract_from_company_name(company.name)
    if hit:
        add(hit[0], hit[1], "Firmenname", 95)

    hit = extract_from_detail_slug(company.detail_url)
    if hit:
        add(hit[0], hit[1], "Herold-URL", 92)

    if detail_html:
        hit = extract_from_detail_page(detail_html)
        if hit:
            add(hit[0], hit[1], "Herold-Detailseite", 90)

    has_strong = any(score >= 90 for _, _, _, score in candidates)
    if scrape_websites and not has_strong:
        hit = extract_from_website(company.website)
        if hit:
            add(hit[0], hit[1], "Webseite/Impressum", 88)

    if not candidates:
        company.contact_source = "nicht gefunden"
        return company

    candidates.sort(key=lambda x: x[3], reverse=True)
    best = candidates[0]
    company.contact_person = best[0]
    company.contact_role = best[1]
    company.contact_source = best[2]
    company.extra_contacts = [
        {"person": p, "role": r, "source": s}
        for p, r, s, sc in candidates[1:4]
        if p != best[0]
    ]
    return company


def listing_url(page: int) -> str:
    if page <= 1:
        return BASE + LISTING_PATH
    return f"{BASE}{LISTING_PATH}seite/{page}/"


def scrape_listings(max_pages: int | None, delay: float) -> list[Company]:
    all_companies: dict[str, Company] = {}
    page = 1
    total_pages: int | None = None

    while True:
        if max_pages is not None and page > max_pages:
            break
        if total_pages is not None and page > total_pages:
            break

        url = listing_url(page)
        print(f"[listing] Seite {page}: {url}", file=sys.stderr)
        try:
            html = fetch(url)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            print(f"  !! Fehler auf Seite {page}: {exc}", file=sys.stderr)
            page += 1
            if delay:
                time.sleep(delay)
            continue
        companies, detected_total = parse_listing_page(html)
        if detected_total is not None:
            total_pages = detected_total

        for c in companies:
            key = c.herold_id or c.detail_url or f"{c.name}|{c.email}"
            all_companies[key] = c

        print(
            f"  -> {len(companies)} Treffer mit E-Mail+Webseite (gesamt unique: {len(all_companies)})",
            file=sys.stderr,
        )
        if not companies and page > 1:
            break
        page += 1
        if delay:
            time.sleep(delay)

    return list(all_companies.values())


def enrich_contacts(
    companies: list[Company],
    workers: int,
    scrape_websites: bool,
    delay: float,
) -> None:
    detail_cache: dict[str, str] = {}

    def load_detail(url: str) -> str:
        if not url:
            return ""
        if url not in detail_cache:
            try:
                detail_cache[url] = fetch(url)
            except (urllib.error.URLError, TimeoutError):
                detail_cache[url] = ""
            if delay:
                time.sleep(delay)
        return detail_cache[url]

    def process(company: Company) -> Company:
        detail_html = load_detail(company.detail_url) if company.detail_url else None
        return pick_contact(company, detail_html, scrape_websites=scrape_websites)

    if workers <= 1:
        for i, company in enumerate(companies, 1):
            pick_contact(
                company,
                load_detail(company.detail_url) if company.detail_url else None,
                scrape_websites=scrape_websites,
            )
            if i % 25 == 0:
                print(f"[kontakt] {i}/{len(companies)}", file=sys.stderr)
        return

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(process, c): c for c in companies}
        done = 0
        for fut in as_completed(futures):
            company = futures[fut]
            result = fut.result()
            company.contact_person = result.contact_person
            company.contact_role = result.contact_role
            company.contact_source = result.contact_source
            company.extra_contacts = result.extra_contacts
            done += 1
            if done % 50 == 0:
                print(f"[kontakt] {done}/{len(companies)}", file=sys.stderr)


def write_csv(path: str, companies: Iterable[Company]) -> None:
    rows = list(companies)
    fieldnames = [
        "name",
        "email",
        "website",
        "contact_person",
        "contact_role",
        "contact_source",
        "phone",
        "address",
        "postal_code",
        "city",
        "detail_url",
        "herold_id",
    ]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for c in rows:
            writer.writerow(asdict(c))


def write_json(path: str, companies: Iterable[Company]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump([asdict(c) for c in companies], f, ensure_ascii=False, indent=2)


def main() -> int:
    parser = argparse.ArgumentParser(description="Herold Immobilienmakler scraper")
    parser.add_argument(
        "--output-csv",
        default="scripts/output/herold_immobilienmakler.csv",
        help="CSV output path",
    )
    parser.add_argument(
        "--output-json",
        default="scripts/output/herold_immobilienmakler.json",
        help="JSON output path",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Limit listing pages (default: all, aktuell ~111)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Parallel workers for contact enrichment",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.35,
        help="Delay between HTTP requests (seconds)",
    )
    parser.add_argument(
        "--no-website-scrape",
        action="store_true",
        help="Skip impressum/team lookup on company websites",
    )
    parser.add_argument(
        "--skip-contacts",
        action="store_true",
        help="Only scrape listings (no contact person lookup)",
    )
    args = parser.parse_args()

    companies = scrape_listings(max_pages=args.max_pages, delay=args.delay)
    print(f"\nGefunden: {len(companies)} Unternehmen mit E-Mail + Webseite", file=sys.stderr)

    if not args.skip_contacts:
        enrich_contacts(
            companies,
            workers=args.workers,
            scrape_websites=not args.no_website_scrape,
            delay=args.delay,
        )
        with_contact = sum(1 for c in companies if c.contact_person)
        print(
            f"Ansprechpartner identifiziert: {with_contact}/{len(companies)}",
            file=sys.stderr,
        )

    import os

    os.makedirs(os.path.dirname(args.output_csv) or ".", exist_ok=True)
    os.makedirs(os.path.dirname(args.output_json) or ".", exist_ok=True)
    write_csv(args.output_csv, companies)
    write_json(args.output_json, companies)

    print(f"CSV:  {args.output_csv}")
    print(f"JSON: {args.output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
